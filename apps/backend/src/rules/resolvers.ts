import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import { notFound } from '../auth/errors.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  approveRule,
  countRules,
  createRule,
  deleteRule,
  findRuleById,
  listRules,
  setRuleReleaseTier,
  unapproveRule,
  updateRule,
} from './repo.js';
import {
  RULE_KINDS,
  RULE_STATUSES,
  decodeSource,
  encodeSource,
  type RuleKind,
  type RuleSource,
  type RuleStatus,
} from './kinds.js';
import { RELEASE_TIERS, type ReleaseTier } from '../cti/kinds.js';
import { checkRulePushAllowed } from '../cti/release/guards.js';
import type { RuleFilter } from './types.js';

const CreateRuleSchema = z.object({
  kind: z.enum(RULE_KINDS),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().min(1).max(64 * 1024),
  tags: z.array(z.string()).default([]),
  status: z.enum(RULE_STATUSES).optional(),
  derivedFromArtifactIds: z.array(z.string()).default([]),
  detectsTechniqueIds: z.array(z.string()).default([]),
});

const UpdateRuleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().min(1).max(64 * 1024).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(RULE_STATUSES).optional(),
});

function clampPage(raw: number | undefined): number {
  if (!raw || !Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}
function clampPerPage(raw: number | undefined, dflt: number, max: number): number {
  if (!raw || !Number.isInteger(raw) || raw <= 0) return dflt;
  return Math.min(raw, max);
}

function encodeRow(row: import('./types.js').DetectionRuleRow): import('./types.js').DetectionRuleRow {
  // GraphQL enum names can't have hyphens. Encode 'cross-agency' → 'cross_agency'.
  return {
    ...row,
    source: encodeSource(row.source) as RuleSource,
    releaseTier: row.releaseTier.replace(/-/g, '_') as ReleaseTier,
  };
}

export const ruleResolvers = {
  Query: {
    detectionRule: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      const r = await findRuleById(ctx.activeOrgId, args.id);
      return r ? encodeRow(r) : null;
    },

    dryRunPushRule: async (
      _p: unknown,
      args: { ruleId: string; targetMaxTier: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const decoded = args.targetMaxTier.replace(/_/g, '-') as ReleaseTier;
      if (!(RELEASE_TIERS as readonly string[]).includes(decoded)) {
        throw notFound(`Invalid target tier: ${args.targetMaxTier}`);
      }
      const rule = await findRuleById(ctx.activeOrgId, args.ruleId);
      if (!rule) throw notFound('rule not found');
      return checkRulePushAllowed(
        {
          id: rule.id,
          releaseTier: rule.releaseTier,
          approvedAt: rule.approvedAt,
          approvalContentHash: rule.approvalContentHash,
          content: rule.content,
        },
        decoded,
      );
    },

    detectionRules: async (
      _p: unknown,
      args: { filter?: { kind?: RuleKind; status?: RuleStatus; source?: string; tag?: string; search?: string }; page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const page = clampPage(args.page);
      const perPage = clampPerPage(args.perPage, 25, 100);
      const filter: RuleFilter = {
        kind: args.filter?.kind ?? null,
        status: args.filter?.status ?? null,
        source: decodeSource(args.filter?.source),
        tag: args.filter?.tag ?? null,
        search: args.filter?.search ?? null,
      };
      const [items, total] = await Promise.all([
        listRules(ctx.activeOrgId, filter, page, perPage),
        countRules(ctx.activeOrgId, filter),
      ]);
      return { items: items.map(encodeRow), total, page, perPage };
    },
  },

  Mutation: {
    createDetectionRule: async (_p: unknown, args: { input: unknown }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const input = CreateRuleSchema.parse(args.input);
      const created = await createRule(ctx.activeOrgId, ctx.user.id, input);
      return encodeRow(created);
    },

    updateDetectionRule: async (_p: unknown, args: { id: string; input: unknown }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const input = UpdateRuleSchema.parse(args.input);
      const updated = await updateRule(ctx.activeOrgId, args.id, input);
      if (!updated) throw notFound('detection rule not found');
      return encodeRow(updated);
    },

    deleteDetectionRule: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const ok = await deleteRule(ctx.activeOrgId, args.id);
      if (!ok) throw notFound('detection rule not found');
      return true;
    },

    setRuleReleaseTier: async (
      _p: unknown,
      args: { id: string; tier: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      // GraphQL enum is underscored ('cross_agency'); storage is dashed
      // ('cross-agency'). Decode at the boundary.
      const decoded = args.tier.replace(/_/g, '-') as ReleaseTier;
      if (!(RELEASE_TIERS as readonly string[]).includes(decoded)) {
        throw notFound(`Invalid release tier: ${args.tier}`);
      }
      const updated = await setRuleReleaseTier(ctx.activeOrgId, ctx.user.id, args.id, decoded);
      return encodeRow(updated);
    },

    approveRule: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return encodeRow(await approveRule(ctx.activeOrgId, ctx.user.id, args.id));
    },

    unapproveRule: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return encodeRow(await unapproveRule(ctx.activeOrgId, ctx.user.id, args.id));
    },
  },
};
