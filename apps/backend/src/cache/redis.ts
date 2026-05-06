import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../logger.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const c = new Redis(config.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    reconnectOnError(err: Error) {
      const targets = ['READONLY', 'ETIMEDOUT'];
      return targets.some((t) => err.message.includes(t));
    },
  });
  c.on('error', (err: unknown) => logger.warn({ err: String(err) }, 'redis client error'));
  c.on('ready', () => logger.info('redis client ready'));
  client = c;
  return client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const r = getRedis();
    const out = await r.ping();
    return out === 'PONG';
  } catch (err) {
    logger.warn({ err: String(err) }, 'redis ping failed');
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = null;
}
