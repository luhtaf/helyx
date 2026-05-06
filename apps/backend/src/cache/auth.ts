import { cacheDel, cacheWrap } from './index.js';
import { findUserById, getUserOrgRole } from '../tenants/users.repo.js';
import type { AuthedUser, OrgRole } from '../auth/types.js';

const TTL_SECONDS = 60;

const userKey = (id: string) => `auth:user:${id}`;
const roleKey = (userId: string, orgId: string) => `auth:role:${userId}:${orgId}`;

export async function getCachedUser(userId: string): Promise<AuthedUser | null> {
  return cacheWrap<AuthedUser | null>(userKey(userId), TTL_SECONDS, () => findUserById(userId));
}

export async function getCachedUserOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  return cacheWrap<OrgRole | null>(roleKey(userId, orgId), TTL_SECONDS, () =>
    getUserOrgRole(userId, orgId),
  );
}

export async function invalidateUser(userId: string): Promise<void> {
  await cacheDel(userKey(userId));
}

export async function invalidateUserOrgRole(userId: string, orgId: string): Promise<void> {
  await cacheDel(roleKey(userId, orgId));
}

export async function invalidateUserAllRoles(userId: string, orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) return;
  await cacheDel(...orgIds.map((orgId) => roleKey(userId, orgId)));
}
