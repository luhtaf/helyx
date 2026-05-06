import type { Request, Response } from 'express';
import type { AppLoaders } from '../dataloaders/index.js';
import { createLoaders } from '../dataloaders/index.js';
import { verifyAccessToken } from './jwt.js';
import type { AuthedUser, OrgRole } from './types.js';
import { getCachedUser, getCachedUserOrgRole } from '../cache/auth.js';

export interface RequestContext {
  user: AuthedUser | null;
  activeOrgId: string | null;
  activeOrgRole: OrgRole | null;
  loaders: AppLoaders;
  req: Request;
  res: Response;
}

const ORG_HEADER = 'x-helyx-org';
const AUTH_HEADER = 'authorization';

function extractBearer(req: Request): string | null {
  const raw = req.headers[AUTH_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim();
}

function extractActiveOrg(req: Request): string | null {
  const raw = req.headers[ORG_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

export async function buildContext(req: Request, res: Response): Promise<RequestContext> {
  const token = extractBearer(req);
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
