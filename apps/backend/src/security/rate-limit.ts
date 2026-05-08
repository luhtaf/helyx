import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { getRedis } from '../cache/redis.js';

// Single per-request limiter — keyed by user when cookie present, else IP.
// Combined into ONE limiter (was 2 stacked before — caused ERR_ERL_DOUBLE_COUNT
// because both limiters ran on /graphql and double-incremented per request).
// Numbers tuned for analyst hunt workflows (heavy graph queries are normal).
// Bumped from 1000 after Phase 1 UI verify — admin views (reconciliation inbox,
// case detail) fire bursts of cache-and-network refetches + probe queries. 5000
// gives plenty of headroom while still catching abuse. Per-user (when cookie
// present), per-IP (otherwise via ipKeyGenerator).
const MAX_PER_MIN = 5000;
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
function makeSendCommand(): (...args: string[]) => Promise<RedisReply> {
  return (...args: string[]) =>
    (getRedis().call(args[0] as string, ...args.slice(1)) as Promise<RedisReply>);
}

/**
 * One limiter per request. Key resolution:
 * - If session cookie present: hash it → `user:<sha256_32>` (per-user bucket)
 * - Else: use express-rate-limit's `ipKeyGenerator` helper (IPv6-safe per
 *   ERR_ERL_KEY_GEN_IPV6 guidance — collapses /64 prefix for v6, exact for v4)
 *
 * Trust proxy is set in index.ts (config.TRUST_PROXY_HOPS), so req.ip resolves
 * to the real client IP behind nginx/Cloudflare.
 */
export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: makeSendCommand() }),
  keyGenerator: (req) => {
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.helyx_session;
    if (cookie) {
      const hash = createHash('sha256').update(cookie).digest('hex').slice(0, 32);
      return `user:${hash}`;
    }
    return ipKeyGenerator(req.ip ?? '');
  },
  handler: jsonRateLimitHandler,
});
