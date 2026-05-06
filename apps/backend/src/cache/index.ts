import { getRedis } from './redis.js';
import { logger } from '../logger.js';

// In-process Promise registry for single-flight (per-process stampede prevention).
// 100 concurrent reads of same missing key dispatch ONE underlying loader; the
// rest await the same Promise. Per-instance only — multi-instance deploys can
// still stampede across instances (acceptable for current 60s-TTL user cache).
const inFlight = new Map<string, Promise<unknown>>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err: String(err), key }, 'cache get failed — degrading to null');
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: String(err), key }, 'cache set failed (non-fatal)');
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await getRedis().del(...keys);
  } catch (err) {
    logger.warn({ err: String(err), keys }, 'cache del failed (non-fatal)');
  }
}

/**
 * Cache-aside with single-flight + JSON serialization.
 *
 * Cache-failure tolerance: never throws. Redis outage → falls through to
 * direct loader call. Set failures are warned, not raised.
 *
 * Key namespace convention (must match invalidator paths in cache/auth.ts):
 *   auth:user:<userId>
 *   auth:role:<userId>:<orgId>
 *   auth:csrf:<userId>
 *   auth:refresh:<jti>
 *   auth:fail:<email>:ip:<ip>
 *   auth:lock:<email>:ip:<ip>
 *
 * @example
 *   const user = await cacheWrap('auth:user:' + id, 60, () => findUserById(id));
 */
export async function cacheWrap<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const value = await loader();
      await cacheSet(key, value, ttlSeconds);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
