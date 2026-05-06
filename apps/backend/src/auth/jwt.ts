import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { cacheSet, cacheDel } from '../cache/index.js';
import { getRedis } from '../cache/redis.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);
const ISSUER = 'helyx';
const AUDIENCE = 'helyx-api';

// Access tokens are short-lived; refresh tokens handle session extension.
const ACCESS_EXPIRES_IN = '15m';

const REFRESH_TTL_DAYS = 7;
const REFRESH_TTL_S = REFRESH_TTL_DAYS * 86400;
// Grace window: allows one concurrent request to succeed during rotation.
const REFRESH_GRACE_S = 30;

export interface AccessTokenPayload {
  sub: string;
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRES_IN)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.sub !== 'string') return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Refresh token primitives
// ---------------------------------------------------------------------------

const refreshKey = (jti: string) => `auth:refresh:${jti}`;
const refreshGraceKey = (jti: string) => `auth:refresh:grace:${jti}`;

export async function issueRefreshToken(userId: string): Promise<{ jti: string; exp: number }> {
  const jti = randomBytes(24).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + REFRESH_TTL_S;
  await cacheSet(refreshKey(jti), { userId, exp }, REFRESH_TTL_S);
  return { jti, exp };
}

/**
 * Atomically move primary → grace slot, return stored payload.
 *
 * Without atomicity (3 separate Redis ops: GET → SET grace → DEL primary)
 * a process crash between SET and DEL leaves the JTI in BOTH slots —
 * creating a replay vector. A Lua script is a single Redis op, all-or-nothing.
 */
const ATOMIC_MOVE_LUA = `
  local primary = redis.call('GET', KEYS[1])
  if primary then
    redis.call('SET', KEYS[2], primary, 'EX', ARGV[1])
    redis.call('DEL', KEYS[1])
    return primary
  end
  return redis.call('GET', KEYS[2])
`;

export async function consumeRefreshToken(jti: string): Promise<{ userId: string } | null> {
  const r = getRedis();
  const raw = await r.eval(
    ATOMIC_MOVE_LUA,
    2,
    refreshKey(jti),
    refreshGraceKey(jti),
    String(REFRESH_GRACE_S),
  );
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw as string) as { userId: string; exp?: number };
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  await cacheDel(refreshKey(jti), refreshGraceKey(jti));
}
