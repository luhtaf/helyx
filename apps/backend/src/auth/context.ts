import type { IncomingMessage } from 'node:http';
import type { AppLoaders } from '../dataloaders/index.js';
import { findUserById, getUserOrgRole } from '../tenants/users.repo.js';
import { createLoaders } from '../dataloaders/index.js';
import { verifyAccessToken } from './jwt.js';
import type { AuthedUser, OrgRole } from './types.js';

export interface RequestContext {
  user: AuthedUser | null;
  activeOrgId: string | null;
  activeOrgRole: OrgRole | null;
  loaders: AppLoaders;
}

const ORG_HEADER = 'x-helyx-org';
const AUTH_HEADER = 'authorization';

function extractBearer(req: IncomingMessage): string | null {
  const raw = req.headers[AUTH_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim();
}

function extractActiveOrg(req: IncomingMessage): string | null {
  const raw = req.headers[ORG_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

export async function buildContext(req: IncomingMessage): Promise<RequestContext> {
  const token = extractBearer(req);
  if (!token) {
    return {
      user: null,
      activeOrgId: null,
      activeOrgRole: null,
      loaders: createLoaders(''),
    };
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return {
      user: null,
      activeOrgId: null,
      activeOrgRole: null,
      loaders: createLoaders(''),
    };
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    return {
      user: null,
      activeOrgId: null,
      activeOrgRole: null,
      loaders: createLoaders(''),
    };
  }

  const requestedOrg = extractActiveOrg(req);
  const activeOrgRole = requestedOrg ? await getUserOrgRole(user.id, requestedOrg) : null;
  const activeOrgId = activeOrgRole ? requestedOrg : null;

  return { user, activeOrgId, activeOrgRole, loaders: createLoaders(activeOrgId ?? '') };
}
