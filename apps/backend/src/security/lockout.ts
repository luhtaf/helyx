import { getRedis } from '../cache/redis.js';

const WINDOW_S = 15 * 60;
const MAX_FAILS = 5;

const failKey = (key: string) => `auth:fail:${key}`;
const lockKey = (key: string) => `auth:lock:${key}`;

// Email+IP key: attacker knowing victim's email locks themselves out, not victim.
export function lockoutKey(email: string, ip: string): string {
  return `${email.toLowerCase()}:ip:${ip}`;
}

export async function isLocked(key: string): Promise<boolean> {
  const r = getRedis();
  return (await r.get(lockKey(key))) !== null;
}

export async function recordFail(key: string): Promise<{ locked: boolean }> {
  const r = getRedis();
  const cnt = await r.incr(failKey(key));
  if (cnt === 1) await r.expire(failKey(key), WINDOW_S);
  if (cnt >= MAX_FAILS) {
    await r.set(lockKey(key), '1', 'EX', WINDOW_S);
    return { locked: true };
  }
  return { locked: false };
}

export async function clearFails(key: string): Promise<void> {
  const r = getRedis();
  await r.del(failKey(key), lockKey(key));
}
