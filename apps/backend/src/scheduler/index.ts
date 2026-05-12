import cron from 'node-cron';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMitreDailyJob } from './jobs/mitre-daily.js';
import { runNvdDailyJob } from './jobs/nvd-daily.js';

// In-process cron scheduler — for now. Every replica registers the cron
// but `tryAcquireJobLock` ensures only one actually runs each tick.
//
// === Migration path to Kubernetes CronJob (when ready) ===
//
// Each job is already standalone-runnable via the CLI:
//   pnpm --filter @helyx/backend scheduler:run <job-name>
//
// To move a job out of this in-process scheduler:
//   1. Set SCHEDULER_DISABLED=true on BE pods to silence in-process cron
//   2. Create a k8s CronJob manifest (see scheduler/k8s-example.yaml)
//      that runs the same image with command:
//        ["node", "dist/scheduler/cli.js", "<job-name>"]
//   3. The Redis lock primitive works identically — multiple workers
//      and the in-process cron can co-exist during migration; the
//      lock prevents double-runs.
//
// Properties that make this portable:
// - No shared state with the express server (no module-level imports
//   from src/index.ts, no apollo deps loaded)
// - Each job's handler is self-contained (own DB session, own logger)
// - Lock TTL caps in-flight time; crashed pods reclaim on next tick
// - Idempotent: every job uses MERGE-based or cursor-based sync
//
// Test/scripts envs skip — we don't want migrate, seed, or test runs to
// trigger the daily fetch as a side effect.

interface ScheduledJob {
  name: string;
  cron: string;
  handler: () => Promise<void>;
}

const JOBS: ScheduledJob[] = [
  // Cron syntax: minute hour day-of-month month day-of-week (Asia/Jakarta)
  // Stagger jobs across the low-traffic window so they don't share a
  // Neo4j tx peak. MITRE 02:00 → NVD 03:00 leaves headroom for either to
  // run long without colliding.
  { name: 'mitre-daily', cron: '0 2 * * *', handler: runMitreDailyJob },
  { name: 'nvd-daily',   cron: '0 3 * * *', handler: runNvdDailyJob },
];

let registered = false;

export function startScheduler(): void {
  if (registered) {
    logger.warn('startScheduler called twice — ignoring');
    return;
  }
  if (config.NODE_ENV === 'test') {
    logger.info('scheduler disabled in NODE_ENV=test');
    registered = true;
    return;
  }
  if (config.SCHEDULER_DISABLED) {
    logger.info('scheduler disabled via SCHEDULER_DISABLED=true (CronJob mode)');
    registered = true;
    return;
  }
  for (const job of JOBS) {
    if (!cron.validate(job.cron)) {
      logger.error({ job: job.name, cron: job.cron }, 'invalid cron expression — skipping');
      continue;
    }
    cron.schedule(job.cron, () => {
      void job.handler().catch((err) => {
        logger.error({ job: job.name, err: String(err) }, 'job handler threw');
      });
    }, { timezone: 'Asia/Jakarta' });
    logger.info({ job: job.name, cron: job.cron, tz: 'Asia/Jakarta' }, 'scheduled');
  }
  registered = true;
}

// Manual trigger for ops / one-shot CLI ("force a run now"). Bypasses
// the cron schedule but still respects the Redis lock.
export async function runJobNow(name: string): Promise<void> {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error(`unknown job: ${name}`);
  await job.handler();
}
