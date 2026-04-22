import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const TENANT_STATS = gql`
  query TenantStats($mode: MatchMode = EXACT) {
    tenantStats {
      assetCount
      componentCount
      cveCount(mode: $mode)
      assetsByKind { kind count }
      cveCountsBySeverity(mode: $mode) { severity count }
      topCves(mode: $mode, limit: 8) {
        cveId
        severity
        baseScore
        affectedAssetCount
        publishedAt
      }
    }
  }
`;

export type MatchMode = 'EXACT' | 'MAJOR_MINOR' | 'MAJOR' | 'BEAST';

interface Stats {
  assetCount: number;
  componentCount: number;
  cveCount: number;
  assetsByKind: { kind: string; count: number }[];
  cveCountsBySeverity: { severity: string | null; count: number }[];
  topCves: {
    cveId: string;
    severity: string | null;
    baseScore: number | null;
    affectedAssetCount: number;
    publishedAt: string | null;
  }[];
}

export function useTenantStats(mode: () => MatchMode, enabled: () => boolean) {
  const { result, loading, error, refetch } = useQuery<{ tenantStats: Stats }>(
    TENANT_STATS,
    () => ({ mode: mode() }),
    () => ({ enabled: enabled(), fetchPolicy: 'cache-and-network' }),
  );
  const stats = computed(() => result.value?.tenantStats ?? null);
  return { stats, loading, error, refetch };
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export function severityCount(
  rows: { severity: string | null; count: number }[] | undefined | null,
  severity: (typeof SEVERITY_ORDER)[number],
): number {
  return rows?.find((r) => r.severity === severity)?.count ?? 0;
}
