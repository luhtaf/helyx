import cron from 'node-cron';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMitreDailyJob } from './jobs/mitre-daily.js';

// In-process cron scheduler. Multi-instance deployments: every replica
// fires the cron, but `tryAcquireJobLock` ensures only one actually runs
// the work. If we ever outgrow this (heavy jobs, dedicated worker tier)
// extract jobs into a standalone process behind the same lock primitive.
//
// Test/scripts envs skip — we don't want migrate, seed, or test runs to
// trigger the daily fetch as a side effect.

interface ScheduledJob {
  name: string;
  cron: string;
  handler: () => Promise<void>;
}

const JOBS: ScheduledJob[] = [
  // Daily 02:00 WIB (Asia/Jakarta) = 19:00 UTC. Low BE traffic window.
  // Cron syntax: minute hour day-of-month month day-of-week
  { name: 'mitre-daily', cron: '0 2 * * *', handler: runMitreDailyJob },
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
