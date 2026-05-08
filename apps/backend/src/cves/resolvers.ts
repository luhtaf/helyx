import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import { findAssetById, listStakeholderAssets } from '../assets/assets.repo.js';
import type { MatchMode } from '../assets/types.js';
import { listCases } from '../cases/repo.js';
import {
  countAffectedAssets,
  countStakeholderAssets,
  countStakeholderCves,
  countTenantCves,
  getCve,
  listAffectedAssets,
  listCveReferences,
  listCveWeaknesses,
  listStakeholderCves,
  listTenantCves,
  type AffectedAssetRow,
  type CveDetail,
  type TenantCveFilter,
} from './cve.repo.js';

interface CveDetailParent extends CveDetail {
  __tenantId: string;
}

function clampPage(raw: number | undefined): number {
  if (!raw || !Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

function clampPerPage(raw: number | undefined, dflt: number, max: number): number {
  if (!raw || !Number.isInteger(raw) || raw <= 0) return dflt;
  return Math.min(raw, max);
}

export const cveResolvers = {
  Query: {
    cve: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      const cve = await getCve(args.id);
      if (!cve) return null;
      return { ...cve, __tenantId: ctx.activeOrgId };
    },

    tenantCves: async (
      _p: unknown,
      args: { filter?: TenantCveFilter & { mode?: MatchMode }; page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const page = clampPage(args.page);
      const perPage = clampPerPage(args.perPage, 25, 100);
      const filter: TenantCveFilter = {
        severity: args.filter?.severity ?? null,
        search: args.filter?.search ?? null,
      };
      const mode: MatchMode = args.filter?.mode ?? 'EXACT';
      const [items, total] = await Promise.all([
        listTenantCves(ctx.activeOrgId, mode, filter, page, perPage),
        countTenantCves(ctx.activeOrgId, mode, filter),
      ]);
      return { items, total, page, perPage };
    },
  },

  CveDetail: {
    weaknesses: (parent: CveDetailParent) => listCveWeaknesses(parent.id),
    references: (parent: CveDetailParent) => listCveReferences(parent.id),
    affectedAssets: async (
      parent: CveDetailParent,
      args: { page?: number; perPage?: number },
    ) => {
      const page = clampPage(args.page);
      const perPage = clampPerPage(args.perPage, 25, 100);
      const [items, total] = await Promise.all([
        listAffectedAssets(parent.id, parent.__tenantId, page, perPage),
        countAffectedAssets(parent.id, parent.__tenantId),
      ]);
      return { items: items.map((row) => ({ __row: row, __tenantId: parent.__tenantId })), total, page, perPage };
    },
  },

  AffectedAsset: {
    asset: async (parent: { __row: AffectedAssetRow; __tenantId: string }) =>
      findAssetById(parent.__tenantId, parent.__row.assetId),
    componentPurl: (parent: { __row: AffectedAssetRow }) => parent.__row.componentPurl,
    matchMode: (parent: { __row: AffectedAssetRow }) => parent.__row.matchMode,
  },

  // Stakeholder→OWNS→Asset→...→CVE field resolvers. Live in cves module
  // because they own the CVE chain logic. Auth: VIEWER suffices (read-only).
  Stakeholder: {
    cveCount: async (
      parent: { id: string },
      args: { mode?: MatchMode },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const mode: MatchMode = args.mode ?? 'EXACT';
      return countStakeholderCves(ctx.activeOrgId, parent.id, mode, { severity: null, search: null });
    },

    cves: async (
      parent: { id: string },
      args: { mode?: MatchMode; severity?: string | null; search?: string | null; page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const page = clampPage(args.page);
      const perPage = clampPerPage(args.perPage, 25, 100);
      const mode: MatchMode = args.mode ?? 'EXACT';
      const filter: TenantCveFilter = {
        severity: args.severity ?? null,
        search: args.search ?? null,
      };
      const [items, total] = await Promise.all([
        listStakeholderCves(ctx.activeOrgId, parent.id, mode, filter, page, perPage),
        countStakeholderCves(ctx.activeOrgId, parent.id, mode, filter),
      ]);
      return { items, total, page, perPage };
    },

    assetCount: async (parent: { id: string }, _args: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return countStakeholderAssets(ctx.activeOrgId, parent.id);
    },

    assets: async (parent: { id: string }, args: { limit?: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      const limit = clampPerPage(args.limit, 50, 200);
      return listStakeholderAssets(ctx.activeOrgId, parent.id, limit);
    },

    cases: async (
      parent: { id: string },
      args: { status?: string[]; first?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      const first = clampPerPage(args.first, 50, 200);
      return listCases(ctx.activeOrgId, {
        stakeholderId: parent.id,
        status: args.status,
        first,
        offset: 0,
      });
    },
  },
};
