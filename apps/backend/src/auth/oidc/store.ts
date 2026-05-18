import { getRedis } from '../../cache/redis.js';

// OIDC transaction state — bridges the /start redirect and the
// /callback. Holds the PKCE verifier + nonce + post-login target,
// keyed by the opaque `state` value. Single-use: consume does an
// atomic GETDEL so a replayed callback (stolen code) can't reuse a
// state. 10-min TTL bounds the auth dance.
//
// Same Redis surface convention as security/lockout.ts. Key TTL'd →
// eviction-safe under volatile-lru.

const TTL_S = 600;
const key = (state: string) => `oidc:state:${state}`;

export interface OidcTxn {
  codeVerifier: string;
  nonce: string;
  /** Where to send the browser after success (SPA origin root). */
  returnTo: string;
}

export async function putTxn(state: string, txn: OidcTxn): Promise<void> {
  await getRedis().set(key(state), JSON.stringify(txn), 'EX', TTL_S);
}

// Atomic single-use read. GETDEL (Redis 6.2+) returns the value and
// deletes in one round-trip so two concurrent callbacks can't both
// pass — the second gets null and is rejected as a replay.
export async function consumeTxn(state: string): Promise<OidcTxn | null> {
  const raw = await getRedis().getdel(key(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OidcTxn;
  } catch {
    return null;
  }
}
