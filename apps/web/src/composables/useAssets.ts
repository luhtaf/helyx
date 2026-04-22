import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { MatchMode } from './useDashboard';

const ASSETS_LIST = gql`
  query Assets($kind: AssetKind, $search: String, $page: Int, $perPage: Int) {
    assets(kind: $kind, search: $search, page: $page, perPage: $perPage) {
      total
      page
      perPage
      items {
        id
        kind
        name
        hostname
        ipAddresses
        childCount
        componentCount
        cveCount
        createdAt
      }
    }
  }
`;

const ASSET_DETAIL = gql`
  query AssetDetail($id: ID!, $mode: MatchMode!) {
    asset(id: $id) {
      id
      kind
      name
      hostname
      ipAddresses
      createdAt
      updatedAt
      childCount
      componentCount
      parent { id name kind }
      children { id name kind childCount }
      components(limit: 100) {
        id
        purl
        name
        version
        type
        cpeUri
      }
      cveCount(mode: $mode)
      cves(mode: $mode, limit: 50) {
        cveId
        severity
        baseScore
        publishedAt
        componentPurl
        cpeUri
        mode
      }
    }
  }
`;

export interface AssetListItem {
  id: string;
  kind: string;
  name: string;
  hostname: string | null;
  ipAddresses: string[];
  childCount: number;
  componentCount: number;
  cveCount: number;
  createdAt: string;
}

export interface AssetListPage {
  total: number;
  page: number;
  perPage: number;
  items: AssetListItem[];
}

export interface ChildAsset {
  id: string;
  name: string;
  kind: string;
  childCount: number;
}

export interface ParentAsset {
  id: string;
  name: string;
  kind: string;
}

export interface ComponentRow {
  id: string;
  purl: string;
  name: string;
  version: string | null;
  type: string | null;
  cpeUri: string | null;
}

export interface AssetCveRow {
  cveId: string;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
  componentPurl: string;
  cpeUri: string;
  mode: MatchMode;
}

export interface AssetDetail {
  id: string;
  kind: string;
  name: string;
  hostname: string | null;
  ipAddresses: string[];
  createdAt: string;
  updatedAt: string;
  childCount: number;
  componentCount: number;
  parent: ParentAsset | null;
  children: ChildAsset[];
  components: ComponentRow[];
  cveCount: number;
  cves: AssetCveRow[];
}

export function useAssetsList(opts: {
  kind: () => string | null;
  search: () => string | null;
  page: () => number;
  perPage: () => number;
  enabled?: () => boolean;
}) {
  const { result, loading, error } = useQuery<{ assets: AssetListPage }>(
    ASSETS_LIST,
    () => ({
      kind: opts.kind() || null,
      search: opts.search() || null,
      page: opts.page(),
      perPage: opts.perPage(),
    }),
    () => ({ enabled: opts.enabled ? opts.enabled() : true, fetchPolicy: 'cache-and-network' }),
  );
  const data = computed(() => result.value?.assets ?? null);
  return { data, loading, error };
}

export function useAssetDetail(id: () => string, mode: () => MatchMode) {
  const { result, loading, error } = useQuery<{ asset: AssetDetail | null }>(
    ASSET_DETAIL,
    () => ({ id: id(), mode: mode() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  const asset = computed(() => result.value?.asset ?? null);
  return { asset, loading, error };
}
