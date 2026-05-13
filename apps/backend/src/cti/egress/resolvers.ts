import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../../auth/middleware.js';
import type { RequestContext } from '../../auth/context.js';
import { logAudit } from '../../audits/log.js';
import {
  listEgressEntries, addEgressEntry, disableEgressEntry, enableEgressEntry,
  getEgressEntry,
} from './repo.js';
import { isHostnameAllowed } from './repo.js';
import { isValidHostname, normalizeHostname, type PdnEgressEntry } from './types.js';

interface EgressCheck {
  hostname: string;
  allowed: boolean;
  reason: string | null;
}

export const ctiEgressResolvers = {
  Query: {
    async pdnEgressEntries(
      _p: unknown, _a: unknown, ctx: RequestContext,
    ): Promise<PdnEgressEntry[]> {
      assertOrgRole(ctx, 'ANALYST');
      return listEgressEntries(ctx.activeOrgId);
    },

    async checkPdnEgress(
      _p: unknown, args: { url: string }, ctx: RequestContext,
    ): Promise<EgressCheck> {
      assertOrgRole(ctx, 'ANALYST');
      let hostname: string;
      try {
        hostname = new URL(args.url).hostname.toLowerCase();
      } catch {
        return { hostname: '', allowed: false, reason: 'invalid_url' };
      }
      if (!isValidHostname(hostname)) {
        return { hostname, allowed: false, reason: 'invalid_hostname' };
      }
      const allowed = await isHostnameAllowed(ctx.activeOrgId, hostname);
      return { hostname, allowed, reason: allowed ? null : 'not_in_allowlist' };
    },
  },

  Mutation: {
    async addPdnEgressEntry(
      _p: unknown,
      args: { hostname: string; label: string },
      ctx: RequestContext,
    ): Promise<PdnEgressEntry> {
      assertOrgRole(ctx, 'OWNER');
      const label = args.label.trim();
      if (label.length === 0) {
        throw new GraphQLError('label is required', {
          extensions: { code: 'BAD_INPUT', field: 'label' },
        });
      }
      const normalized = normalizeHostname(args.hostname);
      if (!isValidHostname(normalized)) {
        throw new GraphQLError(`invalid hostname: ${args.hostname}`, {
          extensions: { code: 'BAD_INPUT', field: 'hostname', normalized },
        });
      }
      const entry = await addEgressEntry(
        ctx.activeOrgId, ctx.user.id, normalized, label,
      );
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'pdn_egress.add',
        { type: 'PdnEgressEntry', id: entry.id },
        null,
        { hostname: normalized, label, status: entry.status },
      );
      return entry;
    },

    async disablePdnEgressEntry(
      _p: unknown, args: { id: string }, ctx: RequestContext,
    ): Promise<PdnEgressEntry> {
      assertOrgRole(ctx, 'OWNER');
      const before = await getEgressEntry(ctx.activeOrgId, args.id);
      if (!before) {
        throw new GraphQLError('egress entry not found', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      const updated = await disableEgressEntry(ctx.activeOrgId, args.id, ctx.user.id);
      if (!updated) {
        throw new GraphQLError('egress entry vanished between read + write', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'pdn_egress.disable',
        { type: 'PdnEgressEntry', id: args.id },
        { status: before.status },
        { status: 'disabled', hostname: before.hostname },
      );
      return updated;
    },

    async enablePdnEgressEntry(
      _p: unknown, args: { id: string }, ctx: RequestContext,
    ): Promise<PdnEgressEntry> {
      assertOrgRole(ctx, 'OWNER');
      const before = await getEgressEntry(ctx.activeOrgId, args.id);
      if (!before) {
        throw new GraphQLError('egress entry not found', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      const updated = await enableEgressEntry(ctx.activeOrgId, args.id);
      if (!updated) {
        throw new GraphQLError('egress entry vanished between read + write', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'pdn_egress.enable',
        { type: 'PdnEgressEntry', id: args.id },
        { status: before.status },
        { status: 'active', hostname: before.hostname },
      );
      return updated;
    },
  },
};
