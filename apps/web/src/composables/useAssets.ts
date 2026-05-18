import { computed, ref } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { MatchMode } from './useDashboard';
import type { AssetKind } from './asset-kinds';

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

// Manual asset add — operator workflow (e.g. ops engineer registers
// a hypervisor that's not in spiderfoot/SBOM). createAsset BE accepts
// kind/name/hostname/ipAddresses/parentId; this composable wraps the
// mutation, refetches the assets list (no Apollo cache surgery — safer
// for the page filter state).

const CREATE_ASSET = gql`
  mutation CreateAsset($input: CreateAssetInput!) {
    createAsset(input: $input) {
      id kind name hostname ipAddresses
    }
  }
`;

const ASSET_AUTOCOMPLETE = gql`
  query AssetAutocomplete($search: String!) {
    assets(search: $search, page: 1, perPage: 10) {
      items { id name kind }
    }
  }
`;

export interface CreateAssetInput {
  kind: AssetKind;
  name: string;
  hostname?: string | null;
  ipAddresses?: string[] | null;
  parentId?: string | null;
  stakeholderId?: string | null;
}

export interface AssetAutocompleteHit {
  id: string;
  name: string;
  kind: AssetKind;
}

export function useCreateAsset() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function submit(input: CreateAssetInput): Promise<{ id: string; name: string } | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ createAsset: { id: string; name: string } }>({
        mutation: CREATE_ASSET,
        variables: { input },
        // Refetch the list so new asset appears without manual reload.
        // 'assets' is the active query in AssetsView; refetch by name.
        refetchQueries: ['Assets'],
        awaitRefetchQueries: true,
      });
      return r.data?.createAsset ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  return { submit, submitting, error };
}

const INGEST_SBOM = gql`
  mutation IngestSbom($assetId: ID!, $sbomJson: String!, $sourceFilename: String) {
    ingestSbom(assetId: $assetId, sbomJson: $sbomJson, sourceFilename: $sourceFilename) {
      componentCount
      productLinkCount
      skippedNoPurl
    }
  }
`;

export interface SbomIngestResult {
  componentCount: number;
  productLinkCount: number;
  skippedNoPurl: number;
}

// Optional follow-up after createAsset — attach a CycloneDX SBOM so the
// asset's SoftwareComponents (→ CVE matching) populate immediately.
export function useIngestSbom() {
  const { client } = useApolloClient();
  async function submit(
    assetId: string, sbomJson: string, sourceFilename?: string | null,
  ): Promise<SbomIngestResult | null> {
    try {
      const r = await client.mutate<{ ingestSbom: SbomIngestResult }>({
        mutation: INGEST_SBOM,
        variables: { assetId, sbomJson, sourceFilename: sourceFilename ?? null },
        refetchQueries: ['Assets'],
      });
      return r.data?.ingestSbom ?? null;
    } catch {
      return null;
    }
  }
  return { submit };
}

export function useAssetAutocomplete() {
  const { client } = useApolloClient();
  async function search(q: string): Promise<AssetAutocompleteHit[]> {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];
    try {
      const r = await client.query<{ assets: { items: AssetAutocompleteHit[] } }>({
        query: ASSET_AUTOCOMPLETE,
        variables: { search: trimmed },
        fetchPolicy: 'network-only',
      });
      return r.data.assets.items;
    } catch {
      return [];
    }
  }
  return { search };
}

export function useAssetDetail(id: () => string, mode: () => MatchMode) {
  const { result, loading, error, refetch } = useQuery<{ asset: AssetDetail | null }>(
    ASSET_DETAIL,
    () => ({ id: id(), mode: mode() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  const asset = computed(() => result.value?.asset ?? null);
  return { asset, loading, error, refetch };
}
