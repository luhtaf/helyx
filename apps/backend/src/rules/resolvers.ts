import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import { notFound } from '../auth/errors.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  countRules,
  createRule,
  deleteRule,
  findRuleById,
  listRules,
  updateRule,
} from './repo.js';
import type { RuleFilter, RuleKind, RuleSource, RuleStatus } from './types.js';

// `RuleSource` enum in GraphQL uses underscore (sigma_community) but JS-side
// is hyphenated (sigma-community). Translate at the boundary.
function decodeSource(s: RuleSource | string | undefined | null): RuleSource | null {
  if (!s) return null;
  const map: Record<string, RuleSource> = {
    manual: 'manual',
    sigma_community: 'sigma-community',
    otx: 'otx',
    helyx_generated: 'helyx-generated',
    imported_stix: 'imported-stix',
    imported_openioc: 'imported-openioc',
  };
  return map[s] ?? (s as RuleSource);
}

// Mirror enum for the resolver-encoded field — Helyx stores 'sigma-community'
// in Neo4j but GraphQL exposes 'sigma_community' (enum names can't have '-').
function encodeSource(s: RuleSource): string {
  return s.replace(/-/g, '_');
}

const CreateRuleSchema = z.object({
  kind: z.enum(['YARA', 'SURICATA', 'SIGMA', 'OWASP', 'CUSTOM']),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().min(1).max(64 * 1024),
  tags: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED']).optional(),
  derivedFromArtifactIds: z.array(z.string()).default([]),
  detectsTechniqueIds: z.array(z.string()).default([]),
});

const UpdateRuleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().min(1).max(64 * 1024).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED']).optional(),
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
  return { ...row, source: encodeSource(row.source) as RuleSource };
}

export const ruleResolvers = {
  Query: {
    detectionRule: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      const r = await findRuleById(ctx.activeOrgId, args.id);
      return r ? encodeRow(r) : null;
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
  },
};
