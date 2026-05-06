import type { Request, Response } from 'express';
import type { AppLoaders } from '../dataloaders/index.js';
import { createLoaders } from '../dataloaders/index.js';
import { verifyAccessToken } from './jwt.js';
import type { AuthedUser, OrgRole } from './types.js';
import { getCachedUser, getCachedUserOrgRole } from '../cache/auth.js';
import { readSessionCookie } from './cookie.js';

export interface RequestContext {
  user: AuthedUser | null;
  activeOrgId: string | null;
  activeOrgRole: OrgRole | null;
  loaders: AppLoaders;
  req: Request;
  res: Response;
}

const ORG_HEADER = 'x-helyx-org';

function extractToken(req: Request): string | null {
  const cookieToken = readSessionCookie(req);
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return null;
}

function extractActiveOrg(req: Request): string | null {
  const raw = req.headers[ORG_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

export async function buildContext(req: Request, res: Response): Promise<RequestContext> {
  const token = extractToken(req);
  if (!token) {
    return {
      user: null,
      activeOrgId: null,
      activeOrgRole: null,
      loaders: createLoaders(''),
      req,
      res,
    };
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return {
      user: null,
      activeOrgId: null,
      activeOrgRole: null,
      loaders: createLoaders(''),
      req,
      res,
    };
  }

  const user = await getCachedUser(payload.sub);
  if (!user) {
    return {
      user: null,
      activeOrgId: null,
      activeOrgRole: null,
      loaders: createLoaders(''),
      req,
      res,
    };
  }

  const requestedOrg = extractActiveOrg(req);
  const activeOrgRole = requestedOrg ? await getCachedUserOrgRole(user.id, requestedOrg) : null;
  const activeOrgId = activeOrgRole ? requestedOrg : null;

  return { user, activeOrgId, activeOrgRole, loaders: createLoaders(activeOrgId ?? ''), req, res };
}
