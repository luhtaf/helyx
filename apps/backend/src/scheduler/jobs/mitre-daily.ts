import { logger } from '../../logger.js';
import { syncMitre } from '../../sources/mitre/sync.js';
import { tryAcquireJobLock } from '../lock.js';

// Daily MITRE ATT&CK refresh — IntrusionSets, AttackPatterns (incl.
// sub-techniques), data-sources, USES edges. STIX bundle re-publish
// cadence is irregular but always within a 24h window for material
// changes, so daily check is safe and cheap. Sync is MERGE-based so
// re-running over unchanged bundle is idempotent.
//
// Lock TTL = 30min — generous upper bound on a clean sync (typical:
// ~30s with cached HTTP, ~3min cold). If a holding process crashes
// mid-run, the next tick reclaims after this expires.

const JOB_NAME = 'mitre-daily';
const LOCK_TTL_SECONDS = 30 * 60;

export async function runMitreDailyJob(): Promise<void> {
  const lock = await tryAcquireJobLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!lock) {
    logger.info({ job: JOB_NAME }, 'skipped — another instance holds the lock');
    return;
  }
  const startedAt = Date.now();
  try {
    logger.info({ job: JOB_NAME }, 'starting');
    await syncMitre({});
    logger.info({ job: JOB_NAME, durationMs: Date.now() - startedAt }, 'completed');
  } catch (err) {
    logger.error({ job: JOB_NAME, err: String(err), durationMs: Date.now() - startedAt }, 'failed');
    // Don't rethrow — a failed daily sync shouldn't crash the whole BE.
    // Next tick retries; ops sees the error log.
  } finally {
    await lock.release();
  }
}
