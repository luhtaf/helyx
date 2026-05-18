import { getSession } from '../../db/neo4j.js';
import { seal, open } from '../../crypto/secretbox.js';

// :OidcConfig singleton (id='singleton'). Instance-global SSO config,
// admin-managed. clientSecret is AES-256-GCM sealed at rest and never
// leaves the server except (decrypted, in-memory) at token exchange.

const SINGLETON = 'singleton';

export interface OidcAdminView {
  enabled: boolean;
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLoginRedirect: string;
  scopes: string;
  /** True when a sealed clientSecret is stored — never the value. */
  hasClientSecret: boolean;
  updatedAt: string | null;
}

export interface OidcRuntime {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLoginRedirect: string;
  scopes: string;
}

export interface OidcUpsertInput {
  issuer: string;
  clientId: string;
  /** Omit/empty to keep the existing sealed secret on update. */
  clientSecret?: string | null;
  redirectUri: string;
  postLoginRedirect: string;
  scopes: string;
}

interface RawRow {
  enabled: boolean | null;
  issuer: string | null;
  clientId: string | null;
  clientSecretSealed: string | null;
  redirectUri: string | null;
  postLoginRedirect: string | null;
  scopes: string | null;
  updatedAt: string | null;
}

async function readRaw(): Promise<RawRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:OidcConfig {id: $id})
       RETURN c.enabled AS enabled, c.issuer AS issuer, c.clientId AS clientId,
              c.clientSecretSealed AS clientSecretSealed,
              c.redirectUri AS redirectUri, c.postLoginRedirect AS postLoginRedirect,
              c.scopes AS scopes, toString(c.updatedAt) AS updatedAt`,
      { id: SINGLETON },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return {
      enabled: rec.get('enabled'),
      issuer: rec.get('issuer'),
      clientId: rec.get('clientId'),
      clientSecretSealed: rec.get('clientSecretSealed'),
      redirectUri: rec.get('redirectUri'),
      postLoginRedirect: rec.get('postLoginRedirect'),
      scopes: rec.get('scopes'),
      updatedAt: rec.get('updatedAt'),
    };
  } finally {
    await session.close();
  }
}

function isComplete(r: RawRow): boolean {
  return Boolean(r.issuer && r.clientId && r.clientSecretSealed && r.redirectUri);
}

// Admin-panel view. Always returns a shape (defaults when unset) so the
// form renders cleanly on first visit. Never includes the secret.
export async function getOidcAdmin(): Promise<OidcAdminView> {
  const r = await readRaw();
  if (!r) {
    return {
      enabled: false, issuer: '', clientId: '',
      redirectUri: 'http://localhost:5173/auth/oidc/callback',
      postLoginRedirect: 'http://localhost:5173/login',
      scopes: 'openid email profile',
      hasClientSecret: false, updatedAt: null,
    };
  }
  return {
    enabled: Boolean(r.enabled) && isComplete(r),
    issuer: r.issuer ?? '',
    clientId: r.clientId ?? '',
    redirectUri: r.redirectUri ?? 'http://localhost:5173/auth/oidc/callback',
    postLoginRedirect: r.postLoginRedirect ?? 'http://localhost:5173/login',
    scopes: r.scopes ?? 'openid email profile',
    hasClientSecret: Boolean(r.clientSecretSealed),
    updatedAt: r.updatedAt,
  };
}

// Runtime view for the SSO routes. null = SSO not usable (disabled or
// incomplete) → routes 404. clientSecret decrypted here only.
export async function getOidcRuntime(): Promise<OidcRuntime | null> {
  const r = await readRaw();
  if (!r || !r.enabled || !isComplete(r)) return null;
  let clientSecret: string;
  try {
    clientSecret = open(r.clientSecretSealed!);
  } catch {
    return null; // tampered / master-key mismatch — fail closed
  }
  return {
    issuer: r.issuer!,
    clientId: r.clientId!,
    clientSecret,
    redirectUri: r.redirectUri!,
    postLoginRedirect: r.postLoginRedirect!,
    scopes: r.scopes || 'openid email profile',
  };
}

export async function isOidcEnabled(): Promise<boolean> {
  const r = await readRaw();
  return Boolean(r && r.enabled && isComplete(r));
}

// Upsert config fields. Secret only re-sealed when a non-empty value is
// supplied (so editing other fields doesn't wipe the secret). Does NOT
// flip enabled — that's a separate explicit toggle.
export async function upsertOidcConfig(input: OidcUpsertInput): Promise<OidcAdminView> {
  const sealed =
    input.clientSecret && input.clientSecret.length > 0 ? seal(input.clientSecret) : null;
  const session = getSession();
  try {
    await session.run(
      `MERGE (c:OidcConfig {id: $id})
       ON CREATE SET c.enabled = false
       SET c.issuer = $issuer, c.clientId = $clientId,
           c.redirectUri = $redirectUri, c.postLoginRedirect = $postLoginRedirect,
           c.scopes = $scopes, c.updatedAt = datetime()
       FOREACH (_ IN CASE WHEN $sealed IS NULL THEN [] ELSE [1] END |
         SET c.clientSecretSealed = $sealed)`,
      {
        id: SINGLETON,
        issuer: input.issuer.trim(),
        clientId: input.clientId.trim(),
        redirectUri: input.redirectUri.trim(),
        postLoginRedirect: input.postLoginRedirect.trim(),
        scopes: input.scopes.trim() || 'openid email profile',
        sealed,
      },
    );
  } finally {
    await session.close();
  }
  return getOidcAdmin();
}

// Explicit enable/disable. Refuses to enable an incomplete config so the
// login button never appears for a half-set IdP.
export async function setOidcEnabled(enabled: boolean): Promise<OidcAdminView> {
  if (enabled) {
    const r = await readRaw();
    if (!r || !isComplete(r)) {
      throw new Error('Cannot enable SSO — issuer, clientId, clientSecret and redirectUri are all required first');
    }
  }
  const session = getSession();
  try {
    await session.run(
      `MERGE (c:OidcConfig {id: $id})
       SET c.enabled = $enabled, c.updatedAt = datetime()`,
      { id: SINGLETON, enabled },
    );
  } finally {
    await session.close();
  }
  return getOidcAdmin();
}
