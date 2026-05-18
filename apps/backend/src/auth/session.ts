import type { Response } from 'express';
import { signAccessToken, issueRefreshToken } from './jwt.js';
import { generateCsrfToken, storeCsrfToken } from './csrf.js';
import { setSessionCookie, setCsrfCookie, setRefreshCookie } from './cookie.js';

// Single source of truth for "establish a logged-in session": access
// JWT + CSRF + refresh JTI + the 3 cookies. Password login, refresh
// rotation, and OIDC SSO all call this so every session is
// byte-for-byte indistinguishable downstream (same CSRF guard, same
// refresh rotation, same context resolution). Never inline this dance.
export async function issueUserSession(
  res: Response,
  userId: string,
): Promise<{ token: string }> {
  const token = await signAccessToken(userId);
  const csrfToken = generateCsrfToken();
  await storeCsrfToken(userId, csrfToken);
  const refresh = await issueRefreshToken(userId);
  setSessionCookie(res, token);
  setCsrfCookie(res, csrfToken);
  setRefreshCookie(res, refresh.jti);
  return { token };
}
