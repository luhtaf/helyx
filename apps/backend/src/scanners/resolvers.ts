import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../auth/middleware.js';
import type { RequestContext } from '../auth/context.js';
import { logAudit } from '../audits/log.js';
import {
  listScanners, getScanner, createScanner, rotateScannerToken, setScannerStatus,
  listScanReports, listDiscoveredAssets, setDiscoveredStatus,
  markReportReviewed, isReportFullyReviewed, createScanReport,
  listPendingDiscoveredIds,
} from './repo.js';
import { z } from 'zod';
import { ASSET_KINDS } from '../assets/types.js';
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
    async uploadManualScanReport(
      _p: unknown,
      args: { payloadJson: string },
      ctx: RequestContext,
    ): Promise<{ reportId: string; itemsAccepted: number }> {
      assertOrgRole(ctx, 'ANALYST');
      // Parse + validate the same payload shape that scanner agents POST.
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.payloadJson);
      } catch {
        throw new GraphQLError('payload is not valid JSON', {
          extensions: { code: 'BAD_INPUT', field: 'payloadJson' },
        });
      }
      const KIND_VALUES = [...ASSET_KINDS] as [string, ...string[]];
      const ItemSchema = z.object({
        kind: z.enum(KIND_VALUES),
        name: z.string().trim().min(1).max(255),
        hostname: z.string().trim().max(255).optional(),
        ipAddresses: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
        parentName: z.string().trim().min(1).max(255).optional(),
      });
      const PayloadSchema = z.object({
        format: z.literal('helyx-discovery-v1'),
        items: z.array(ItemSchema).min(1).max(5000),
      });
      const r = PayloadSchema.safeParse(parsed);
      if (!r.success) {
        throw new GraphQLError(`invalid payload: ${r.error.issues[0]?.message ?? 'unknown'}`, {
          extensions: { code: 'BAD_INPUT', issues: r.error.issues.slice(0, 5) },
        });
      }
      const result = await createScanReport(
        ctx.activeOrgId, null, 'manual', r.data.format, r.data, args.payloadJson,
      );
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'scan_report.manual_upload',
        { type: 'ScanReport', id: result.reportId },
        null,
        { itemCount: result.itemsAccepted, format: r.data.format },
      );
      return result;
    },

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
          stakeholderId: null, // scanner-discovered; owner assigned later
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

    async bulkAcceptReport(
      _p: unknown, args: { reportId: string }, ctx: RequestContext,
    ): Promise<number> {
      assertOrgRole(ctx, 'ANALYST');
      const ids = await listPendingDiscoveredIds(ctx.activeOrgId, args.reportId);
      if (ids.length === 0) return 0;
      // Reuse acceptDiscoveredAsNew per-id — keeps parent chain
      // resolution + audit identical to single-item flow. Slow path
      // (one tx per item) but acceptable for inbox batch sizes.
      let accepted = 0;
      for (const id of ids) {
        try {
          await this.acceptDiscoveredAsNew(_p, { discoveredId: id }, ctx);
          accepted++;
        } catch {
          // Per-item failure shouldn't block the batch — operator
          // can re-try the failed ones individually after.
        }
      }
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'inventory.bulk_accept',
        { type: 'ScanReport', id: args.reportId },
        null,
        { accepted, total: ids.length },
      );
      return accepted;
    },

    async bulkRejectReport(
      _p: unknown, args: { reportId: string; reason?: string | null }, ctx: RequestContext,
    ): Promise<number> {
      assertOrgRole(ctx, 'ANALYST');
      const ids = await listPendingDiscoveredIds(ctx.activeOrgId, args.reportId);
      if (ids.length === 0) return 0;
      let rejected = 0;
      for (const id of ids) {
        try {
          const r = await setDiscoveredStatus(ctx.activeOrgId, id, 'rejected', null);
          if (r) rejected++;
        } catch {
          // per-item failure shouldn't block the batch
        }
      }
      if (await isReportFullyReviewed(ctx.activeOrgId, args.reportId)) {
        await markReportReviewed(ctx.activeOrgId, args.reportId, ctx.user.id);
      }
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'inventory.bulk_reject',
        { type: 'ScanReport', id: args.reportId },
        null,
        { rejected, total: ids.length, reason: args.reason ?? null },
      );
      return rejected;
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
