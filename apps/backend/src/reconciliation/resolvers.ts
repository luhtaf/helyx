import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  bulkResolveRawStakeholders,
  cacheSuggestions,
  findRawStakeholder,
  listRawStakeholders,
  listSuggestionsForRaw,
  rawStakeholderCounts,
  recomputeSuggestionsForAll,
  rejectRawStakeholder,
  resolveRawStakeholder,
} from './repo.js';
import { rankSuggestions } from './fuzzy.js';
import { createStakeholder, findStakeholder, listStakeholders } from '../stakeholders/repo.js';
import type { RawStakeholderRow, ReconciliationStatus } from './types.js';
import type { StakeholderInput } from '../stakeholders/types.js';
import { logAudit } from '../audits/log.js';

export const reconciliationResolvers = {
  Query: {
    rawStakeholders: (_p: unknown, args: { status: ReconciliationStatus; first: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return listRawStakeholders(ctx.activeOrgId, args.status, args.first);
    },
    rawStakeholder: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return findRawStakeholder(ctx.activeOrgId, args.id);
    },
    rawStakeholderCounts: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return rawStakeholderCounts(ctx.activeOrgId);
    },
  },
  Mutation: {
    resolveRawStakeholder: async (_p: unknown, args: { rawId: string; stakeholderId: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const before = await findRawStakeholder(ctx.activeOrgId, args.rawId);
      const after = await resolveRawStakeholder(ctx.activeOrgId, args.rawId, args.stakeholderId, ctx.user.id);
      await logAudit(
        ctx.activeOrgId,
        ctx.user.id,
        'reconciliation.resolve',
        { type: 'RawStakeholder', id: args.rawId },
        before ? { status: before.status, resolvedToId: before.resolvedToId } : null,
        { status: after.status, resolvedToId: after.resolvedToId },
      );
      return after;
    },
    bulkResolveRawStakeholders: async (_p: unknown, args: { rawIds: string[]; stakeholderId: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const count = await bulkResolveRawStakeholders(ctx.activeOrgId, args.rawIds, args.stakeholderId, ctx.user.id);
      await logAudit(
        ctx.activeOrgId,
        ctx.user.id,
        'reconciliation.bulk_resolve',
        { type: 'RawStakeholder', id: '(bulk)' },
        null,
        { count, rawIds: args.rawIds, stakeholderId: args.stakeholderId },
      );
      return count;
    },
    createStakeholderFromRaw: async (_p: unknown, args: { rawId: string; input: StakeholderInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const created = await createStakeholder(ctx.activeOrgId, args.input);
      return resolveRawStakeholder(ctx.activeOrgId, args.rawId, created.id, ctx.user.id);
    },
    rejectRawStakeholder: (_p: unknown, args: { rawId: string; reason?: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      return rejectRawStakeholder(ctx.activeOrgId, args.rawId, args.reason ?? null, ctx.user.id);
    },
    recomputeSuggestions: async (_p: unknown, args: { rawId?: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const tenantId = ctx.activeOrgId;
      if (args.rawId) {
        const raw = await findRawStakeholder(tenantId, args.rawId);
        if (!raw) return 0;
        const cands = await listStakeholders(tenantId, { first: 1000 });
        const sugg = rankSuggestions({ rawName: raw.rawName, rawNormalizedKey: raw.normalizedKey }, cands);
        await cacheSuggestions(tenantId, raw.id, sugg);
        return 1;
      }
      return recomputeSuggestionsForAll(tenantId);
    },
  },
  RawStakeholder: {
    resolvedTo: async (parent: RawStakeholderRow, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return parent.resolvedToId ? findStakeholder(ctx.activeOrgId, parent.resolvedToId) : null;
    },
    suggestions: async (parent: RawStakeholderRow, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const rows = await listSuggestionsForRaw(ctx.activeOrgId, parent.id);
      const out = await Promise.all(
        rows.map(async (r) => ({
          stakeholder: await findStakeholder(ctx.activeOrgId, r.stakeholderId),
          confidence: r.confidence,
          reason: r.reason,
        })),
      );
      return out.filter((x) => x.stakeholder !== null);
    },
  },
};
