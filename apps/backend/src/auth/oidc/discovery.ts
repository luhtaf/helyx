import { createRemoteJWKSet } from 'jose';
import { logger } from '../../logger.js';

// OIDC discovery — fetch + memoize the provider's
// .well-known/openid-configuration, keyed by issuer (config is
// DB-driven now, so the issuer can change at runtime via the admin
// panel — cache is per-issuer + invalidated on config save). jose's
// JWKS getter handles key rotation/caching internally.

export interface OidcDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

const cache = new Map<string, OidcDiscovery>();
const inflight = new Map<string, Promise<OidcDiscovery>>();

interface DiscoveryDoc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

async function fetchDiscovery(issuerBase: string): Promise<OidcDiscovery> {
  const base = issuerBase.replace(/\/+$/, '');
  const url = `${base}/.well-known/openid-configuration`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${resp.status} from ${url}`);
  }
  const doc = (await resp.json()) as Partial<DiscoveryDoc>;
  if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('OIDC discovery doc missing required endpoints');
  }
  logger.info({ issuer: doc.issuer }, 'OIDC discovery loaded');
  return {
    issuer: doc.issuer,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    jwks: createRemoteJWKSet(new URL(doc.jwks_uri)),
  };
}

export async function getDiscovery(issuerBase: string): Promise<OidcDiscovery> {
  const hit = cache.get(issuerBase);
  if (hit) return hit;
  const pending = inflight.get(issuerBase);
  if (pending) return pending;
  const p = fetchDiscovery(issuerBase)
    .then((d) => {
      cache.set(issuerBase, d);
      inflight.delete(issuerBase);
      return d;
    })
    .catch((e) => {
      inflight.delete(issuerBase);
      throw e;
    });
  inflight.set(issuerBase, p);
  return p;
}

// Called when the admin saves OIDC config — drop memoized discovery so
// an issuer change takes effect without a backend restart.
export function invalidateDiscovery(): void {
  cache.clear();
  inflight.clear();
}
