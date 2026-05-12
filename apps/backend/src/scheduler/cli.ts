// One-shot manual trigger for any scheduled job. Bypasses the cron
// schedule but still respects the Redis lock (so concurrent ops + cron
// can't double-run). Used for: forcing a sync after schema/data fix,
// post-deploy warmup, debugging.
//
// Usage: pnpm --filter @helyx/backend scheduler:run mitre-daily

import { closeDriver } from '../db/neo4j.js';
import { logger } from '../logger.js';
import { runJobNow } from './index.js';

const jobName = process.argv[2];
if (!jobName) {
  console.error('usage: tsx src/scheduler/cli.ts <job-name>');
  console.error('known jobs: mitre-daily');
  process.exit(2);
}

try {
  await runJobNow(jobName);
} catch (err) {
  logger.error({ err: String(err), jobName }, 'job run failed');
  process.exitCode = 1;
} finally {
  await closeDriver();
  process.exit(process.exitCode ?? 0);
}
