import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import type { MatchMode } from '../assets/types.js';
import {
  countAssets,
  countAssetsByKind,
  countComponents,
  countTenantCves,
  countTenantCvesBySeverity,
  countTopTenantCves,
  listRecentTenantCves,
} from './stats.repo.js';

export const dashboardResolvers = {
  Query: {
    tenantStats: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return { __tenantId: ctx.activeOrgId };
    },
  },

  TenantStats: {
    assetCount: (parent: { __tenantId: string }) => countAssets(parent.__tenantId),
    assetsByKind: (parent: { __tenantId: string }) => countAssetsByKind(parent.__tenantId),
    componentCount: (parent: { __tenantId: string }) => countComponents(parent.__tenantId),
    cveCount: (parent: { __tenantId: string }, args: { mode?: MatchMode }) =>
      countTenantCves(parent.__tenantId, args.mode ?? 'EXACT'),
    cveCountsBySeverity: (parent: { __tenantId: string }, args: { mode?: MatchMode }) =>
      countTenantCvesBySeverity(parent.__tenantId, args.mode ?? 'EXACT'),
    topCves: (parent: { __tenantId: string }, args: { mode?: MatchMode; limit?: number }) =>
      countTopTenantCves(parent.__tenantId, args.mode ?? 'EXACT', clampLimit(args.limit, 5, 50)),
    recentCves: (parent: { __tenantId: string }, args: { mode?: MatchMode; limit?: number }) =>
      listRecentTenantCves(parent.__tenantId, args.mode ?? 'EXACT', clampLimit(args.limit, 5, 50)),
  },
};

function clampLimit(raw: number | undefined, dflt: number, max: number): number {
  if (raw == null) return dflt;
  if (!Number.isInteger(raw) || raw <= 0) return dflt;
  return Math.min(raw, max);
}
