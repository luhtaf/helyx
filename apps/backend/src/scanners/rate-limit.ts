import { getRedis } from '../cache/redis.js';
import { config } from '../config.js';

// Per-scanner ingest throttle. Fixed-window counter keyed by scanner id
// (NOT token — token is already hashed by the time we get here, and the
// scanner id is stable across token rotation so a rotated token inherits
// the same bucket within the window). Same INCR+EXPIRE shape as
// security/lockout.ts so the Redis surface stays consistent.
//
// Redis policy is volatile-lru and this key is always TTL'd, so it's
// eviction-safe. Degrades open: if Redis is down, getRedis() throws and
// the caller treats it as allowed (availability > strict throttle for an
// ingest path that already requires a valid token + active scanner).

const rateKey = (scannerId: string) => `scanner:rate:${scannerId}`;

export interface ScannerRateResult {
  allowed: boolean;
  count: number;
  limit: number;
  /** Seconds until the current window resets (only meaningful when blocked). */
  resetSeconds: number;
}

export async function checkScannerRate(scannerId: string): Promise<ScannerRateResult> {
  const limit = config.SCANNER_RATE_MAX;
  const windowS = config.SCANNER_RATE_WINDOW_S;
  const r = getRedis();
  const key = rateKey(scannerId);
  const count = await r.incr(key);
  if (count === 1) {
    await r.expire(key, windowS);
  }
  if (count > limit) {
    const ttl = await r.ttl(key);
    return {
      allowed: false,
      count,
      limit,
      resetSeconds: ttl > 0 ? ttl : windowS,
    };
  }
  return { allowed: true, count, limit, resetSeconds: 0 };
}
