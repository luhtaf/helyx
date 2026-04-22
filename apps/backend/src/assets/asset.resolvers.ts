import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import { badInput, notFound } from '../auth/errors.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  countAssets,
  createAsset,
  deleteAsset,
  findAssetById,
  findParent,
  listAssets,
  listChildren,
  listRootAssets,
  type DeleteMode,
} from './assets.repo.js';
import { countComponents, listComponents } from './sbom.repo.js';
import { countAssetCves, listAssetCves } from './match.repo.js';
import { ASSET_KINDS, type AssetKind, type AssetRecord, type MatchMode } from './types.js';

const KindEnum = z.enum(ASSET_KINDS as readonly [AssetKind, ...AssetKind[]]);

const CreateAssetSchema = z.object({
  kind: KindEnum,
  name: z.string().trim().min(1).max(255),
  hostname: z.string().trim().min(1).max(255).nullable().optional(),
  ipAddresses: z.array(z.string().trim().min(1)).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export const assetResolvers = {
  Query: {
    asset: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findAssetById(ctx.activeOrgId, args.id);
    },

    assets: async (
      _p: unknown,
      args: { kind?: AssetKind | null; search?: string | null; page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const page = !args.page || !Number.isInteger(args.page) || args.page < 1 ? 1 : args.page;
      const perPage = clampLimit(args.perPage, 25, 100);
      const filters = { kind: args.kind ?? null, search: args.search ?? null };
      const [items, total] = await Promise.all([
        listAssets(ctx.activeOrgId, { ...filters, page, perPage }),
        countAssets(ctx.activeOrgId, filters),
      ]);
      return { items, total, page, perPage };
    },

    rootAssets: async (_p: unknown, args: { limit?: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listRootAssets(ctx.activeOrgId, clampLimit(args.limit, 100, 500));
    },
  },

  Mutation: {
    createAsset: async (_p: unknown, args: { input: unknown }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const input = CreateAssetSchema.parse(args.input);
      return createAsset({
        tenantId: ctx.activeOrgId,
        kind: input.kind,
        name: input.name,
        hostname: input.hostname ?? null,
        ipAddresses: input.ipAddresses ?? [],
        parentId: input.parentId ?? null,
      });
    },

    deleteAsset: async (
      _p: unknown,
      args: { id: string; mode?: DeleteMode },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return deleteAsset(ctx.activeOrgId, args.id, args.mode ?? 'PROMOTE_CHILDREN');
    },
  },

  Asset: {
    parent: (parent: AssetRecord, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findParent(ctx.activeOrgId, parent.id);
    },
    children: (parent: AssetRecord, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listChildren(ctx.activeOrgId, parent.id);
    },
    components: (parent: AssetRecord, args: { limit?: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listComponents(ctx.activeOrgId, parent.id, clampLimit(args.limit, 50, 1000));
    },
    componentCount: (parent: AssetRecord, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return countComponents(ctx.activeOrgId, parent.id);
    },
    cves: (parent: AssetRecord, args: { mode?: MatchMode; limit?: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listAssetCves(ctx.activeOrgId, parent.id, args.mode ?? 'EXACT', clampLimit(args.limit, 50, 500));
    },
    cveCount: (parent: AssetRecord, args: { mode?: MatchMode }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return countAssetCves(ctx.activeOrgId, parent.id, args.mode ?? 'EXACT');
    },
  },

  CveMatch: {
    baseScore: (parent: { cvssV31BaseScore: number | null }) => parent.cvssV31BaseScore,
    severity: (parent: { cvssV31BaseSeverity: string | null }) => parent.cvssV31BaseSeverity,
  },
};

function clampLimit(raw: number | undefined, dflt: number, max: number): number {
  if (raw == null) return dflt;
  if (!Number.isInteger(raw) || raw <= 0) throw badInput('limit must be a positive integer', 'limit');
  return Math.min(raw, max);
}

export { notFound };
