import type { RequestContext } from './context.js';
import { forbidden, missingOrgContext, unauthenticated } from './errors.js';
import { hasAtLeast, type AuthedUser, type OrgRole } from './types.js';

export interface AuthedContext extends RequestContext {
  user: AuthedUser;
}

export interface OrgContext extends AuthedContext {
  activeOrgId: string;
  activeOrgRole: OrgRole;
}

export function assertAuthed(ctx: RequestContext): asserts ctx is AuthedContext {
  if (!ctx.user) throw unauthenticated();
}

export function assertOrgRole(ctx: RequestContext, required: OrgRole): asserts ctx is OrgContext {
  assertAuthed(ctx);
  if (!ctx.activeOrgId || !ctx.activeOrgRole) throw missingOrgContext();
  if (!hasAtLeast(ctx.activeOrgRole, required)) throw forbidden(`Requires role ${required} or higher`);
}
