import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import { badInput, conflict, notFound } from '../auth/errors.js';
import { assertAuthed, assertOrgRole } from '../auth/middleware.js';
import { ORG_ROLES, type OrgRole } from '../auth/types.js';
import { isValidSlug } from '../utils/slug.js';
import {
  addMember,
  createOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  listMembers,
  listOrganizationsForUser,
  type OrganizationRecord,
  type OrganizationWithRole,
} from './orgs.repo.js';
import { getUserOrgRole } from './users.repo.js';

const CreateOrgInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(2).max(63),
});

const AddMemberInput = z.object({
  orgId: z.string().min(1),
  email: z.string().email().max(254),
  role: z.enum(ORG_ROLES as readonly [OrgRole, ...OrgRole[]]),
});

export const orgResolvers = {
  Query: {
    myOrganizations: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertAuthed(ctx);
      return listOrganizationsForUser(ctx.user.id);
    },

    organization: async (_p: unknown, args: { slug: string }, ctx: RequestContext) => {
      assertAuthed(ctx);
      const org = await findOrganizationBySlug(args.slug);
      if (!org) throw notFound('Organization not found');
      const role = await getUserOrgRole(ctx.user.id, org.id);
      if (!role) throw notFound('Organization not found');
      return { ...org, myRole: role };
    },
  },

  Mutation: {
    createOrganization: async (_p: unknown, raw: unknown, ctx: RequestContext) => {
      assertAuthed(ctx);
      const args = CreateOrgInput.parse(raw);
      if (!isValidSlug(args.slug)) throw badInput('slug must match [a-z0-9-]', 'slug');
      const existing = await findOrganizationBySlug(args.slug);
      if (existing) throw conflict('Organization slug already taken');
      const org = await createOrganization({
        name: args.name,
        slug: args.slug,
        ownerUserId: ctx.user.id,
      });
      return { ...org, myRole: 'OWNER' as OrgRole };
    },

    addOrganizationMember: async (_p: unknown, raw: unknown, ctx: RequestContext) => {
      const args = AddMemberInput.parse(raw);
      assertAuthed(ctx);
      const callerRole = await getUserOrgRole(ctx.user.id, args.orgId);
      if (!callerRole || (callerRole !== 'OWNER' && callerRole !== 'ADMIN')) {
        assertOrgRole({ ...ctx, activeOrgId: args.orgId, activeOrgRole: callerRole }, 'ADMIN');
      }
      const result = await addMember({
        orgId: args.orgId,
        userEmail: args.email,
        role: args.role,
      });
      if (!result) throw notFound('User not found — they must register first');
      return {
        user: { id: result.userId, email: result.userEmail, displayName: result.userDisplayName },
        role: result.role,
        joinedAt: result.joinedAt,
      };
    },
  },

  Organization: {
    myRole: async (parent: OrganizationRecord & { myRole?: OrgRole }, _a: unknown, ctx: RequestContext) => {
      if (parent.myRole) return parent.myRole;
      assertAuthed(ctx);
      return getUserOrgRole(ctx.user.id, parent.id);
    },

    members: async (parent: OrganizationRecord, _a: unknown, ctx: RequestContext) => {
      assertAuthed(ctx);
      const callerRole = await getUserOrgRole(ctx.user.id, parent.id);
      if (!callerRole) throw notFound('Organization not found');
      const rows = await listMembers(parent.id);
      return rows.map((m) => ({
        user: { id: m.userId, email: m.userEmail, displayName: m.userDisplayName },
        role: m.role,
        joinedAt: m.joinedAt,
      }));
    },
  },
};

export type { OrganizationWithRole };
