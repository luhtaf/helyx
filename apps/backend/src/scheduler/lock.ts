import { randomUUID } from 'node:crypto';
import { getRedis } from '../cache/redis.js';

// Distributed single-flight lock for scheduled jobs. Multi-instance BE
// deployments would otherwise fire the same daily job from each replica.
// Lock TTL caps "in-flight" time; if the holding process dies mid-run the
// next tick reclaims after expiry. Uses Redis SET NX EX + atomic
// compare-and-delete on release so we never release someone else's lock.

const RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export interface LockHandle {
  key: string;
  token: string;
  release: () => Promise<void>;
}

/**
 * Acquire a job lock. Returns null if another holder already owns it.
 * Caller must invoke `release()` in a finally block.
 */
export async function tryAcquireJobLock(
  jobName: string,
  ttlSeconds: number,
): Promise<LockHandle | null> {
  const redis = getRedis();
  const key = `scheduler:lock:${jobName}`;
  const token = randomUUID();
  const ok = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (ok !== 'OK') return null;
  return {
    key,
    token,
    release: async () => {
      try {
        await redis.eval(RELEASE_LUA, 1, key, token);
      } catch {
        // Lock will expire naturally; degrade silently on Redis blip.
      }
    },
  };
}
