import { logger } from '../../logger.js';
import { syncNvd } from '../../sources/nvd/sync.js';
import { tryAcquireJobLock } from '../lock.js';

// Daily NVD CVE delta refresh. Sync defaults `since` to the last-saved
// :_SyncState.lastModEndDate, so a daily tick naturally backfills gaps
// (missing a day is harmless — next run catches up). Manual one-shot
// via `pnpm scheduler:run nvd-daily` for ops force-refresh.
//
// Lock TTL = 60min — generous upper bound. Cold pull of 7-day window
// with NVD_API_KEY: ~2-5min. Without key: ~30-45min (rate-limited at
// 6.5s per request). We always have the key in prod.

const JOB_NAME = 'nvd-daily';
const LOCK_TTL_SECONDS = 60 * 60;

export async function runNvdDailyJob(): Promise<void> {
  const lock = await tryAcquireJobLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!lock) {
    logger.info({ job: JOB_NAME }, 'skipped — another instance holds the lock');
    return;
  }
  const startedAt = Date.now();
  try {
    logger.info({ job: JOB_NAME }, 'starting');
    const result = await syncNvd({});
    logger.info({ job: JOB_NAME, durationMs: Date.now() - startedAt, ...result }, 'completed');
  } catch (err) {
    logger.error({ job: JOB_NAME, err: String(err), durationMs: Date.now() - startedAt }, 'failed');
  } finally {
    await lock.release();
  }
}
