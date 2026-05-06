import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { getRedis } from '../cache/redis.js';

const IP_MAX = 300;
const USER_MAX = 1000;
const WINDOW_MS = 60 * 1000;

function jsonRateLimitHandler(_req: Request, res: Response): void {
  const retryAfter = res.getHeader('Retry-After');
  res.status(429).json({
    errors: [{
      message: 'Too many requests — slow down and retry',
      extensions: {
        code: 'RATE_LIMITED',
        retryAfter: retryAfter ? Number(retryAfter) : 60,
      },
    }],
  });
}

// ioredis call() is typed as returning unknown; we cast to satisfy SendCommandFn.
// The underlying Redis protocol guarantees the values are strings/numbers.
function makeSendCommand(): (...args: string[]) => Promise<RedisReply> {
  return (...args: string[]) =>
    (getRedis().call(args[0] as string, ...args.slice(1)) as Promise<RedisReply>);
}

export const ipLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: makeSendCommand() }),
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: jsonRateLimitHandler,
});

export const userLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: makeSendCommand() }),
  keyGenerator: (req) => {
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.helyx_session;
    if (cookie) {
      const hash = createHash('sha256').update(cookie).digest('hex').slice(0, 32);
      return `user:${hash}`;
    }
    return req.ip ?? 'unknown';
  },
  handler: jsonRateLimitHandler,
});
