import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { MatchMode } from './useDashboard';

const TENANT_CVES = gql`
  query TenantCves($filter: TenantCveFilterInput, $page: Int, $perPage: Int) {
    tenantCves(filter: $filter, page: $page, perPage: $perPage) {
      total
      page
      perPage
      items {
        cveId
        description
        severity
        baseScore
        publishedAt
        affectedAssetCount
      }
    }
  }
`;

const CVE_DETAIL = gql`
  query CveDetail($id: ID!) {
    cve(id: $id) {
      id
      description
      vulnStatus
      sourceIdentifier
      publishedAt
      lastModifiedAt
      cvssV31BaseScore
      cvssV31BaseSeverity
      cvssV31VectorString
      cvssV2BaseScore
      cvssV2BaseSeverity
      cvssV2VectorString
      weaknesses { id name }
      references { url source tags }
      affectedAssets(perPage: 50) {
        total
        items {
          matchMode
          componentPurl
          asset { id name kind hostname ipAddresses }
        }
      }
    }
  }
`;

export interface TenantCveItem {
  cveId: string;
  description: string | null;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
  affectedAssetCount: number;
}

export interface TenantCvePage {
  total: number;
  page: number;
  perPage: number;
  items: TenantCveItem[];
}

export interface CweRef { id: string; name: string | null }
export interface ReferenceRef { url: string; source: string | null; tags: string[] }
export interface AffectedAssetItem {
  matchMode: 'EXACT' | 'BEAST';
  componentPurl: string | null;
  asset: {
    id: string;
    name: string;
    kind: string;
    hostname: string | null;
    ipAddresses: string[];
  };
}

export interface CveDetail {
  id: string;
  description: string | null;
  vulnStatus: string | null;
  sourceIdentifier: string | null;
  publishedAt: string | null;
  lastModifiedAt: string | null;
  cvssV31BaseScore: number | null;
  cvssV31BaseSeverity: string | null;
  cvssV31VectorString: string | null;
  cvssV2BaseScore: number | null;
  cvssV2BaseSeverity: string | null;
  cvssV2VectorString: string | null;
  weaknesses: CweRef[];
  references: ReferenceRef[];
  affectedAssets: { total: number; items: AffectedAssetItem[] };
}

export function useTenantCves(opts: {
  page: () => number;
  perPage: () => number;
  severity: () => string | null;
  search: () => string | null;
  mode: () => MatchMode;
  enabled?: () => boolean;
}) {
  const { result, loading, error, refetch } = useQuery<{ tenantCves: TenantCvePage }>(
    TENANT_CVES,
    () => ({
      filter: {
        severity: opts.severity() || null,
        search: opts.search() || null,
        mode: opts.mode(),
      },
      page: opts.page(),
      perPage: opts.perPage(),
    }),
    () => ({ enabled: opts.enabled ? opts.enabled() : true, fetchPolicy: 'cache-and-network' }),
  );
  const data = computed(() => result.value?.tenantCves ?? null);
  return { data, loading, error, refetch };
}

export function useCveDetail(id: () => string) {
  const { result, loading, error, refetch } = useQuery<{ cve: CveDetail | null }>(
    CVE_DETAIL,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  const cve = computed(() => result.value?.cve ?? null);
  return { cve, loading, error, refetch };
}
