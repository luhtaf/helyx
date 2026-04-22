export type OrgRole = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';

export const ORG_ROLES: readonly OrgRole[] = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'] as const;

export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  ANALYST: 2,
  VIEWER: 1,
};

export function hasAtLeast(actual: OrgRole | null, required: OrgRole): boolean {
  if (!actual) return false;
  return ORG_ROLE_RANK[actual] >= ORG_ROLE_RANK[required];
}

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
}
