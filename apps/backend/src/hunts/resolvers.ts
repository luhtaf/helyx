import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import { badInput, notFound } from '../auth/errors.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  countCves,
  countHunts,
  countTtps,
  createHunt,
  deleteHunt,
  findHuntById,
  listHunts,
  listScopedAssets,
  listTargetActors,
  listTopCves,
  listTopTtps,
} from './repo.js';
import type { HuntRecord } from './types.js';

const CreateHuntSchema = z.object({
  name: z.string().trim().min(1).max(160),
  targetActorIds: z.array(z.string().min(1)).default([]),
  scopedAssetIds: z.array(z.string().min(1)).default([]),
});

function clampPage(raw: number | undefined): number {
  if (!raw || !Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

function clampLimit(raw: number | undefined, dflt: number, max: number): number {
  if (!raw || !Number.isInteger(raw) || raw <= 0) return dflt;
  return Math.min(raw, max);
}

type HuntParent = HuntRecord;

export const huntResolvers = {
  Query: {
    hunt: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findHuntById(ctx.activeOrgId, args.id);
    },

    hunts: async (
      _p: unknown,
      args: { page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const page = clampPage(args.page);
      const perPage = clampLimit(args.perPage, 25, 100);
      const [items, total] = await Promise.all([
        listHunts(ctx.activeOrgId, page, perPage),
        countHunts(ctx.activeOrgId),
      ]);
      return { items, total, page, perPage };
    },
  },

  Mutation: {
    createHunt: async (_p: unknown, args: { input: unknown }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const input = CreateHuntSchema.parse(args.input);
      if (input.targetActorIds.length === 0 && input.scopedAssetIds.length === 0) {
        throw badInput('hunt must target at least one actor or scope at least one asset', 'input');
      }
      return createHunt({
        tenantId: ctx.activeOrgId,
        userId: ctx.user.id,
        name: input.name,
        targetActorIds: input.targetActorIds,
        scopedAssetIds: input.scopedAssetIds,
      });
    },

    deleteHunt: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const ok = await deleteHunt(ctx.activeOrgId, args.id);
      if (!ok) throw notFound('hunt not found');
      return true;
    },
  },

  Hunt: {
    targetActors: (parent: HuntParent, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listTargetActors(ctx.activeOrgId, parent.id);
    },
    scopedAssets: (parent: HuntParent, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listScopedAssets(ctx.activeOrgId, parent.id);
    },
    findings: (parent: HuntParent) => ({ __huntId: parent.id, __tenantId: parent.tenantId }),
  },

  HuntFindings: {
    ttpCount: (parent: { __huntId: string; __tenantId: string }) =>
      countTtps(parent.__tenantId, parent.__huntId),
    cveCount: (parent: { __huntId: string; __tenantId: string }) =>
      countCves(parent.__tenantId, parent.__huntId),
    topTtps: (parent: { __huntId: string; __tenantId: string }, args: { limit?: number }) =>
      listTopTtps(parent.__tenantId, parent.__huntId, clampLimit(args.limit, 12, 50)),
    topCves: (parent: { __huntId: string; __tenantId: string }, args: { limit?: number }) =>
      listTopCves(parent.__tenantId, parent.__huntId, clampLimit(args.limit, 12, 50)),
  },
};
