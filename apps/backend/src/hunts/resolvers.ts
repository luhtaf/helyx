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
  saveGraphAsHunt,
  searchEntities,
  updateHuntSnapshot,
} from './repo.js';
import { generateRulesFromHunt } from '../exporters/index.js';
import { packHuntRulesAsZip } from '../exporters/zip.js';
import { buildHuntStixBundle, persistStixExport } from '../exporters/stix.js';
import { materializeTtpHunt } from './materialize.repo.js';
import { setHuntReleaseTier } from './repo.js';
import { RELEASE_TIERS, type ReleaseTier } from '../cti/kinds.js';
import { badInput as badInputErr } from '../auth/errors.js';
import type { HuntRecord } from './types.js';

const CreateHuntSchema = z.object({
  name: z.string().trim().min(1).max(160),
  targetActorIds: z.array(z.string().min(1)).default([]),
  scopedAssetIds: z.array(z.string().min(1)).default([]),
});

const SaveGraphAsHuntSchema = z.object({
  name: z.string().trim().min(1).max(160),
  // Cap snapshot at 512KB. Cytoscape JSON of 200 nodes + edges is well under
  // 100KB; 512KB leaves headroom for huge hunts. Reject larger to prevent
  // someone stuffing the DB.
  snapshot: z.string().min(2).max(512 * 1024),
  seedType: z.string().nullable().optional(),
  seedId: z.string().nullable().optional(),
});

const UpdateSnapshotSchema = z.object({
  id: z.string().min(1),
  snapshot: z.string().min(2).max(512 * 1024),
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

    searchEntities: async (
      _p: unknown,
      args: { q: string; first?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const perTypeLimit = clampLimit(args.first, 10, 25);
      return searchEntities(ctx.activeOrgId, args.q, perTypeLimit);
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

    saveGraphAsHunt: async (
      _p: unknown,
      args: { input: unknown },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const input = SaveGraphAsHuntSchema.parse(args.input);
      // Sanity-parse the snapshot — if it's not valid JSON, reject early.
      try {
        const parsed = JSON.parse(input.snapshot);
        if (typeof parsed !== 'object' || parsed === null) {
          throw badInput('snapshot must be a JSON object', 'snapshot');
        }
      } catch {
        throw badInput('snapshot must be valid JSON', 'snapshot');
      }
      return saveGraphAsHunt({
        tenantId: ctx.activeOrgId,
        userId: ctx.user.id,
        name: input.name,
        snapshot: input.snapshot,
        seedType: input.seedType ?? null,
        seedId: input.seedId ?? null,
      });
    },

    updateHuntSnapshot: async (
      _p: unknown,
      args: { id: string; snapshot: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const input = UpdateSnapshotSchema.parse(args);
      const updated = await updateHuntSnapshot(ctx.activeOrgId, input.id, input.snapshot);
      if (!updated) throw notFound('graph hunt not found');
      return updated;
    },

    generateRulesFromHunt: async (
      _p: unknown,
      args: { huntId: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const hunt = await findHuntById(ctx.activeOrgId, args.huntId);
      if (!hunt) throw notFound('hunt not found');
      const { stats } = await generateRulesFromHunt(ctx.activeOrgId, ctx.user.id, {
        id: hunt.id,
        name: hunt.name,
        graphSnapshot: hunt.graphSnapshot,
      });
      return stats;
    },

    packHuntRulesAsZip: async (
      _p: unknown,
      args: { huntId: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const result = await packHuntRulesAsZip(ctx.activeOrgId, args.huntId);
      if (!result.ok) {
        throw result.reason === 'hunt not found'
          ? notFound('hunt not found')
          : badInputErr(result.reason);
      }
      return {
        filename: result.filename,
        base64: result.bytes.toString('base64'),
        ruleCount: result.manifest.ruleCounts.total,
        yaraCount: result.manifest.ruleCounts.yara,
        suricataCount: result.manifest.ruleCounts.suricata,
        sigmaCount: result.manifest.ruleCounts.sigma,
      };
    },

    materializeTtpHunt: async (
      _p: unknown,
      args: { input: { techniqueId: string; actorId?: string | null; stakeholderIds?: string[] | null; proceedToGraph?: boolean; capPerType?: number } },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const techId = args.input.techniqueId.trim();
      if (!/^T\d{4}(\.\d{3})?$/.test(techId)) {
        throw badInputErr(`Invalid technique id "${techId}" — expected T-code like T1486 or T1059.001`);
      }
      const cap = Math.min(Math.max(args.input.capPerType ?? 50, 1), 200);
      return materializeTtpHunt(ctx.activeOrgId, techId, {
        actorId: args.input.actorId ?? null,
        stakeholderIds: args.input.stakeholderIds ?? null,
        proceedToGraph: args.input.proceedToGraph ?? false,
        capPerType: cap,
      });
    },

    exportHuntAsStix: async (
      _p: unknown,
      args: { huntId: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const built = await buildHuntStixBundle(ctx.activeOrgId, args.huntId);
      if (!built.ok) {
        throw built.reason === 'hunt not found'
          ? notFound('hunt not found')
          : badInputErr(built.reason);
      }
      const record = await persistStixExport(
        ctx.activeOrgId,
        args.huntId,
        built.result,
        built.result.sourceRuleIds,
      );
      return {
        exportId: record.id,
        filename: built.result.filename,
        base64: built.result.bytes.toString('base64'),
        bundleId: built.result.bundle.id,
        indicatorCount: built.result.stats.indicatorCount,
        skippedUnapproved: built.result.stats.skippedUnapproved,
        skippedStale: built.result.stats.skippedStale,
        tlp: built.result.stats.tlp,
        contentHash: record.contentHash,
      };
    },

    setHuntReleaseTier: async (
      _p: unknown,
      args: { id: string; tier: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      // GraphQL enum is underscored; storage is dashed (cti/kinds.ts).
      const decoded = args.tier.replace(/_/g, '-') as ReleaseTier;
      if (!(RELEASE_TIERS as readonly string[]).includes(decoded)) {
        throw badInputErr(`Invalid release tier: ${args.tier}`);
      }
      const updated = await setHuntReleaseTier(ctx.activeOrgId, ctx.user.id, args.id, decoded);
      // Encode dash → underscore at boundary (same pattern as ruleResolvers.encodeRow)
      return { ...updated, releaseTier: updated.releaseTier.replace(/-/g, '_') };
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
