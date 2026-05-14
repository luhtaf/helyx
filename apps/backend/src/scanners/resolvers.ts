import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../auth/middleware.js';
import type { RequestContext } from '../auth/context.js';
import { logAudit } from '../audits/log.js';
import {
  listScanners, getScanner, createScanner, rotateScannerToken, setScannerStatus,
  listScanReports, listDiscoveredAssets, setDiscoveredStatus,
  markReportReviewed, isReportFullyReviewed,
} from './repo.js';
import { createAsset } from '../assets/assets.repo.js';
import type { AssetKind } from '../assets/types.js';
import type {
  Scanner, ScanReport, DiscoveredAsset, ScanReportStatus,
} from './types.js';

export const scannerResolvers = {
  Query: {
    async scanners(_p: unknown, _a: unknown, ctx: RequestContext): Promise<Scanner[]> {
      assertOrgRole(ctx, 'ANALYST');
      return listScanners(ctx.activeOrgId);
    },

    async scanReports(
      _p: unknown,
      args: { filter?: { status?: ScanReportStatus | null }; limit?: number },
      ctx: RequestContext,
    ): Promise<ScanReport[]> {
      assertOrgRole(ctx, 'ANALYST');
      const limit = !args.limit || args.limit <= 0 ? 50 : Math.min(args.limit, 100);
      return listScanReports(ctx.activeOrgId, args.filter ?? {}, limit);
    },

    async discoveredAssetsForReport(
      _p: unknown,
      args: { reportId: string },
      ctx: RequestContext,
    ): Promise<DiscoveredAsset[]> {
      assertOrgRole(ctx, 'ANALYST');
      return listDiscoveredAssets(ctx.activeOrgId, args.reportId);
    },
  },

  Mutation: {
    async createScanner(
      _p: unknown,
      args: { input: { label: string; scope: string; expiresAt?: string | null } },
      ctx: RequestContext,
    ) {
      assertOrgRole(ctx, 'OWNER');
      const label = args.input.label.trim();
      const scope = args.input.scope.trim();
      if (!label || !scope) {
        throw new GraphQLError('label + scope required', {
          extensions: { code: 'BAD_INPUT' },
        });
      }
      const r = await createScanner(ctx.activeOrgId, ctx.user.id, {
        label, scope, expiresAt: args.input.expiresAt ?? null,
      });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'scanner.create',
        { type: 'Scanner', id: r.scanner.id },
        null,
        { label, scope, expiresAt: args.input.expiresAt ?? null, tokenPrefix: r.scanner.tokenPrefix },
      );
      return r;
    },

    async rotateScannerToken(
      _p: unknown, args: { id: string }, ctx: RequestContext,
    ) {
      assertOrgRole(ctx, 'OWNER');
      const before = await getScanner(ctx.activeOrgId, args.id);
      if (!before) {
        throw new GraphQLError('scanner not found', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      const r = await rotateScannerToken(ctx.activeOrgId, args.id);
      if (!r) throw new GraphQLError('rotate failed', { extensions: { code: 'INTERNAL' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'scanner.rotate',
        { type: 'Scanner', id: args.id },
        { tokenPrefix: before.tokenPrefix },
        { tokenPrefix: r.scanner.tokenPrefix },
      );
      return r;
    },

    async disableScanner(_p: unknown, args: { id: string }, ctx: RequestContext): Promise<Scanner> {
      assertOrgRole(ctx, 'OWNER');
      const before = await getScanner(ctx.activeOrgId, args.id);
      if (!before) throw new GraphQLError('scanner not found', { extensions: { code: 'NOT_FOUND' } });
      const r = await setScannerStatus(ctx.activeOrgId, args.id, 'disabled');
      if (!r) throw new GraphQLError('disable failed', { extensions: { code: 'INTERNAL' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'scanner.disable',
        { type: 'Scanner', id: args.id },
        { status: before.status }, { status: 'disabled', label: before.label },
      );
      return r;
    },

    async enableScanner(_p: unknown, args: { id: string }, ctx: RequestContext): Promise<Scanner> {
      assertOrgRole(ctx, 'OWNER');
      const before = await getScanner(ctx.activeOrgId, args.id);
      if (!before) throw new GraphQLError('scanner not found', { extensions: { code: 'NOT_FOUND' } });
      const r = await setScannerStatus(ctx.activeOrgId, args.id, 'active');
      if (!r) throw new GraphQLError('enable failed', { extensions: { code: 'INTERNAL' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'scanner.enable',
        { type: 'Scanner', id: args.id },
        { status: before.status }, { status: 'active', label: before.label },
      );
      return r;
    },

    async mergeDiscoveredToExisting(
      _p: unknown, args: { discoveredId: string; assetId: string }, ctx: RequestContext,
    ): Promise<DiscoveredAsset> {
      assertOrgRole(ctx, 'ANALYST');
      const r = await setDiscoveredStatus(
        ctx.activeOrgId, args.discoveredId, 'merged_to_existing', args.assetId,
      );
      if (!r) throw new GraphQLError('discovered not found', { extensions: { code: 'NOT_FOUND' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'inventory.merge',
        { type: 'DiscoveredAsset', id: args.discoveredId },
        null, { matchedAssetId: args.assetId, name: r.name, kind: r.kind },
      );
      // Auto-mark report reviewed when nothing pending
      if (await isReportFullyReviewed(ctx.activeOrgId, r.reportId)) {
        await markReportReviewed(ctx.activeOrgId, r.reportId, ctx.user.id);
      }
      return r;
    },

    async acceptDiscoveredAsNew(
      _p: unknown, args: { discoveredId: string }, ctx: RequestContext,
    ): Promise<DiscoveredAsset> {
      assertOrgRole(ctx, 'ANALYST');
      // Read row → spawn real :Asset → mark merged with new id.
      const list = await listDiscoveredAssets(ctx.activeOrgId, ''); // TODO: getDiscoveredById helper if perf-bound
      // Simpler: fetch one via setDiscoveredStatus dry-read pattern. For
      // v1 do an inline cypher.
      const session = (await import('../db/neo4j.js')).getSession();
      let row: DiscoveredAsset | null = null;
      try {
        const r = await session.run(
          `MATCH (d:DiscoveredAsset {tenantId: $tenantId, id: $id})
           RETURN d.kind AS kind, d.name AS name, d.hostname AS hostname,
                  coalesce(d.ipAddresses, []) AS ipAddresses,
                  d.parentDiscoveredId AS parentDiscoveredId,
                  d.reportId AS reportId`,
          { tenantId: ctx.activeOrgId, id: args.discoveredId },
        );
        if (r.records.length === 0) {
          throw new GraphQLError('discovered not found', { extensions: { code: 'NOT_FOUND' } });
        }
        const rec = r.records[0]!;
        // Resolve parentDiscoveredId → parent's matchedAssetId (chain
        // lookup so a hierarchy ingested in one payload threads through).
        const parentDiscoveredId = (rec.get('parentDiscoveredId') as string | null) ?? null;
        let parentAssetId: string | null = null;
        if (parentDiscoveredId) {
          const pr = await session.run(
            `MATCH (p:DiscoveredAsset {tenantId: $tenantId, id: $id})
             RETURN p.matchedAssetId AS pid`,
            { tenantId: ctx.activeOrgId, id: parentDiscoveredId },
          );
          parentAssetId = pr.records.length === 0 ? null
            : (pr.records[0]!.get('pid') as string | null) ?? null;
        }
        const newAsset = await createAsset({
          tenantId: ctx.activeOrgId,
          kind: rec.get('kind') as AssetKind,
          name: rec.get('name') as string,
          hostname: (rec.get('hostname') as string | null) ?? null,
          ipAddresses: (rec.get('ipAddresses') as string[]) ?? [],
          parentId: parentAssetId,
        });
        row = await setDiscoveredStatus(
          ctx.activeOrgId, args.discoveredId, 'created_new', newAsset.id,
        );
        if (!row) throw new GraphQLError('inconsistent state after accept', { extensions: { code: 'INTERNAL' } });
        await logAudit(
          ctx.activeOrgId, ctx.user.id,
          'inventory.accept_new',
          { type: 'DiscoveredAsset', id: args.discoveredId },
          null,
          { newAssetId: newAsset.id, name: row.name, kind: row.kind, parentAssetId },
        );
        if (await isReportFullyReviewed(ctx.activeOrgId, row.reportId)) {
          await markReportReviewed(ctx.activeOrgId, row.reportId, ctx.user.id);
        }
      } finally {
        await session.close();
      }
      return row;
    },

    async rejectDiscovered(
      _p: unknown, args: { discoveredId: string; reason?: string | null }, ctx: RequestContext,
    ): Promise<DiscoveredAsset> {
      assertOrgRole(ctx, 'ANALYST');
      const r = await setDiscoveredStatus(
        ctx.activeOrgId, args.discoveredId, 'rejected', null,
      );
      if (!r) throw new GraphQLError('discovered not found', { extensions: { code: 'NOT_FOUND' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'inventory.reject',
        { type: 'DiscoveredAsset', id: args.discoveredId },
        null, { reason: args.reason ?? null, name: r.name, kind: r.kind },
      );
      if (await isReportFullyReviewed(ctx.activeOrgId, r.reportId)) {
        await markReportReviewed(ctx.activeOrgId, r.reportId, ctx.user.id);
      }
      return r;
    },
  },
};
