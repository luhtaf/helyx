import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../../logger.js';
import { findUserByEmail } from '../../tenants/users.repo.js';
import { issueUserSession } from '../session.js';
import { getDiscovery } from './discovery.js';
import { putTxn, consumeTxn } from './store.js';
import { getOidcRuntime, isOidcEnabled, type OidcRuntime } from './config-repo.js';

// Phase Z — OIDC SSO (Authorization Code + PKCE), generic provider.
// Config is DB-driven (admin panel at /admin/sso) so the IdP can be
// changed without a redeploy.
//
//   GET /auth/oidc/status   → { enabled } (public; SPA shows the button)
//   GET /auth/oidc/start    → 302 to IdP authorize (state+nonce+PKCE)
//   GET /auth/oidc/callback → exchange code, verify id_token, map the
//                             verified email to an EXISTING :User
//                             (invite-only), issue the standard session.
//
// Invite-only: an authenticated IdP identity logs in ONLY if a :User
// with that verified email already exists — no auto-provisioning, same
// trust model as addOrganizationMember. Mounted before /graphql so the
// CSRF guard doesn't apply (browser top-level navigations); the
// single-use Redis state is the callback's CSRF defense.

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function spaOrigin(cfg: OidcRuntime): string {
  try {
    return new URL(cfg.postLoginRedirect).origin;
  } catch {
    return 'http://localhost:5173';
  }
}

function redirectWithError(res: Response, cfg: OidcRuntime | null, code: string): void {
  const target = cfg?.postLoginRedirect ?? 'http://localhost:5173/login';
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    u = new URL('http://localhost:5173/login');
  }
  u.searchParams.set('sso_error', code);
  res.redirect(302, u.toString());
}

export async function oidcStatusHandler(_req: Request, res: Response): Promise<void> {
  res.json({ enabled: await isOidcEnabled() });
}

export async function oidcStartHandler(_req: Request, res: Response): Promise<void> {
  const cfg = await getOidcRuntime();
  if (!cfg) {
    res.status(404).json({ error: 'SSO not configured' });
    return;
  }
  try {
    const disco = await getDiscovery(cfg.issuer);
    const state = b64url(randomBytes(32));
    const nonce = b64url(randomBytes(32));
    const codeVerifier = b64url(randomBytes(32));
    const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());

    await putTxn(state, { codeVerifier, nonce, returnTo: `${spaOrigin(cfg)}/` });

    const auth = new URL(disco.authorizationEndpoint);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('client_id', cfg.clientId);
    auth.searchParams.set('redirect_uri', cfg.redirectUri);
    auth.searchParams.set('scope', cfg.scopes);
    auth.searchParams.set('state', state);
    auth.searchParams.set('nonce', nonce);
    auth.searchParams.set('code_challenge', codeChallenge);
    auth.searchParams.set('code_challenge_method', 'S256');
    res.redirect(302, auth.toString());
  } catch (e) {
    logger.error({ err: String(e) }, 'OIDC start failed');
    redirectWithError(res, cfg, 'discovery_failed');
  }
}

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function oidcCallbackHandler(req: Request, res: Response): Promise<void> {
  const cfg = await getOidcRuntime();
  if (!cfg) {
    res.status(404).json({ error: 'SSO not configured' });
    return;
  }

  const q = req.query as Record<string, string | undefined>;
  if (q.error) {
    logger.warn({ idpError: q.error }, 'OIDC IdP returned error');
    redirectWithError(res, cfg, 'idp_error');
    return;
  }
  const code = q.code;
  const state = q.state;
  if (!code || !state) {
    redirectWithError(res, cfg, 'missing_params');
    return;
  }

  // Single-use state — also our CSRF defense for the callback.
  const txn = await consumeTxn(state);
  if (!txn) {
    redirectWithError(res, cfg, 'bad_state');
    return;
  }

  try {
    const disco = await getDiscovery(cfg.issuer);

    // Code → tokens. client_secret_basic (widest IdP compatibility).
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      code_verifier: txn.codeVerifier,
    });
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const tokenResp = await fetch(disco.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    });
    const tokens = (await tokenResp.json().catch(() => ({}))) as TokenResponse;
    if (!tokenResp.ok || !tokens.id_token) {
      logger.warn(
        { status: tokenResp.status, idpErr: tokens.error, desc: tokens.error_description },
        'OIDC token exchange failed',
      );
      redirectWithError(res, cfg, 'token_exchange_failed');
      return;
    }

    // Verify the ID token: signature (remote JWKS, auto key-rotation),
    // issuer, audience. Then bind nonce to our stored value (replay +
    // token-substitution defense).
    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(tokens.id_token, disco.jwks, {
        issuer: disco.issuer,
        audience: cfg.clientId,
      });
      payload = verified.payload;
    } catch (e) {
      logger.warn({ err: String(e) }, 'OIDC id_token verification failed');
      redirectWithError(res, cfg, 'invalid_id_token');
      return;
    }
    if (payload.nonce !== txn.nonce) {
      logger.warn('OIDC nonce mismatch');
      redirectWithError(res, cfg, 'nonce_mismatch');
      return;
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const ev = payload.email_verified;
    const emailVerified = ev === true || ev === 'true';
    if (!email || !emailVerified) {
      redirectWithError(res, cfg, 'email_unverified');
      return;
    }

    // Invite-only: identity must already exist as a :User.
    const user = await findUserByEmail(email);
    if (!user) {
      logger.warn({ email }, 'OIDC login for non-provisioned email');
      redirectWithError(res, cfg, 'not_provisioned');
      return;
    }

    await issueUserSession(res, user.id);
    logger.info({ userId: user.id, email, via: 'oidc' }, 'SSO login');
    res.redirect(302, txn.returnTo);
  } catch (e) {
    logger.error({ err: String(e) }, 'OIDC callback failed');
    redirectWithError(res, cfg, 'callback_failed');
  }
}
