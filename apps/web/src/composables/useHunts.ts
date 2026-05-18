import { computed } from 'vue';
import { useApolloClient, useMutation, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const HUNTS_LIST = gql`
  query Hunts($page: Int, $perPage: Int) {
    hunts(page: $page, perPage: $perPage) {
      total
      page
      perPage
      items {
        id
        name
        kind
        status
        createdAt
        targetActorCount
        scopedAssetCount
      }
    }
  }
`;

const HUNT_DETAIL = gql`
  query HuntDetail($id: ID!) {
    hunt(id: $id) {
      id
      name
      status
      createdAt
      updatedAt
      targetActorCount
      scopedAssetCount
      targetActors { id name techniqueCount }
      scopedAssets { id name kind }
      findings {
        ttpCount
        cveCount
        topTtps(limit: 12) { id name killChainPhases actorCount }
        topCves(limit: 12) { cveId severity baseScore affectedAssetCount }
      }
    }
  }
`;

const CREATE_HUNT = gql`
  mutation CreateHunt($input: CreateHuntInput!) {
    createHunt(input: $input) {
      id
      name
    }
  }
`;

const DELETE_HUNT = gql`
  mutation DeleteHunt($id: ID!) {
    deleteHunt(id: $id)
  }
`;

export interface HuntListItem {
  id: string;
  name: string;
  kind: 'STRUCTURED' | 'GRAPH';
  status: string;
  createdAt: string;
  targetActorCount: number;
  scopedAssetCount: number;
}

export interface HuntListPage {
  total: number;
  page: number;
  perPage: number;
  items: HuntListItem[];
}

export interface HuntDetail {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  targetActorCount: number;
  scopedAssetCount: number;
  targetActors: { id: string; name: string; techniqueCount: number }[];
  scopedAssets: { id: string; name: string; kind: string }[];
  findings: {
    ttpCount: number;
    cveCount: number;
    topTtps: { id: string; name: string; killChainPhases: string[]; actorCount: number }[];
    topCves: { cveId: string; severity: string | null; baseScore: number | null; affectedAssetCount: number }[];
  };
}

export function useHuntsList(opts: { page: () => number; perPage: () => number }) {
  const { result, loading, error, refetch } = useQuery<{ hunts: HuntListPage }>(
    HUNTS_LIST,
    () => ({ page: opts.page(), perPage: opts.perPage() }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  const data = computed(() => result.value?.hunts ?? null);
  return { data, loading, error, refetch };
}

export function useHuntDetail(id: () => string) {
  const { result, loading, error, refetch } = useQuery<{ hunt: HuntDetail | null }>(
    HUNT_DETAIL,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  const hunt = computed(() => result.value?.hunt ?? null);
  return { hunt, loading, error, refetch };
}

export function useCreateHunt() {
  const { mutate, loading, error } = useMutation<{ createHunt: { id: string; name: string } }>(CREATE_HUNT);
  async function submit(input: { name: string; targetActorIds: string[]; scopedAssetIds: string[] }) {
    const res = await mutate({ input });
    return res?.data?.createHunt ?? null;
  }
  return { submit, loading, error };
}

export function useDeleteHunt() {
  // Refetch the list so /hunts updates immediately after delete + redirect.
  // Without this, Apollo's cache still serves the deleted hunt and the
  // operator sees it 'come back' on the list page.
  const { mutate, loading, error } = useMutation<{ deleteHunt: boolean }>(DELETE_HUNT, () => ({
    refetchQueries: ['Hunts'],
    awaitRefetchQueries: true,
  }));
  async function submit(id: string): Promise<boolean> {
    try {
      const res = await mutate({ id });
      return Boolean(res?.data?.deleteHunt);
    } catch {
      return false;
    }
  }
  return { submit, loading, error };
}

// ─── G2: Graph-kind hunt save/load + cross-entity search ──────────────

const SAVE_GRAPH_AS_HUNT = gql`
  mutation SaveGraphAsHunt($input: SaveGraphAsHuntInput!) {
    saveGraphAsHunt(input: $input) {
      id name kind graphSnapshot graphSeedType graphSeedId createdAt
    }
  }
`;

const UPDATE_HUNT_SNAPSHOT = gql`
  mutation UpdateHuntSnapshot($id: ID!, $snapshot: String!) {
    updateHuntSnapshot(id: $id, snapshot: $snapshot) { id updatedAt }
  }
`;

const SEARCH_ENTITIES = gql`
  query SearchEntities($q: String!, $first: Int) {
    searchEntities(q: $q, first: $first) { type id label detail }
  }
`;

export interface SaveGraphAsHuntInput {
  name: string;
  snapshot: string;
  seedType?: string | null;
  seedId?: string | null;
}

export function useSaveGraphAsHunt() {
  const { mutate, loading, error } = useMutation<
    { saveGraphAsHunt: { id: string; name: string; graphSnapshot: string | null } },
    { input: SaveGraphAsHuntInput }
  >(SAVE_GRAPH_AS_HUNT, () => ({
    refetchQueries: ['Hunts'],
    awaitRefetchQueries: true,
  }));
  async function submit(input: SaveGraphAsHuntInput) {
    const r = await mutate({ input });
    return r?.data?.saveGraphAsHunt ?? null;
  }
  return { submit, loading, error };
}

const UPDATE_HUNT_NAME = gql`
  mutation UpdateHuntName($id: ID!, $name: String!) {
    updateHuntName(id: $id, name: $name) { id name updatedAt }
  }
`;

export function useUpdateHuntName() {
  // Refetch both list + graph detail so the rename shows everywhere
  // immediately (HuntsView list, /graph?hunt=<id> header).
  const { mutate, loading, error } = useMutation<
    { updateHuntName: { id: string; name: string; updatedAt: string } },
    { id: string; name: string }
  >(UPDATE_HUNT_NAME, () => ({
    refetchQueries: ['Hunts', 'HuntGraphDetail', 'HuntDetail'],
    awaitRefetchQueries: true,
  }));
  async function submit(id: string, name: string) {
    try {
      const r = await mutate({ id, name });
      return r?.data?.updateHuntName ?? null;
    } catch {
      return null;
    }
  }
  return { submit, loading, error };
}

export function useUpdateHuntSnapshot() {
  const { mutate, loading, error } = useMutation<
    { updateHuntSnapshot: { id: string; updatedAt: string } },
    { id: string; snapshot: string }
  >(UPDATE_HUNT_SNAPSHOT);
  async function submit(id: string, snapshot: string) {
    const r = await mutate({ id, snapshot });
    return r?.data?.updateHuntSnapshot ?? null;
  }
  return { submit, loading, error };
}

export interface SearchResult {
  type: 'Stakeholder' | 'Asset' | 'CVE' | 'Case';
  id: string;
  label: string;
  detail: string | null;
}

export function useSearchEntities() {
  // Lazy: caller debounces. Returns search() bound to the active Apollo
  // client. fetchPolicy:'no-cache' so each keystroke gets fresh results.
  const { client } = useApolloClient();
  return {
    async search(q: string, first = 10): Promise<SearchResult[]> {
      if (!q.trim()) return [];
      const r = await client.query({
        query: SEARCH_ENTITIES,
        variables: { q: q.trim(), first },
        fetchPolicy: 'no-cache',
      });
      return ((r.data as { searchEntities?: SearchResult[] })?.searchEntities) ?? [];
    },
  };
}

const GENERATE_RULES_FROM_HUNT = gql`
  mutation GenerateRulesFromHunt($huntId: ID!) {
    generateRulesFromHunt(huntId: $huntId) {
      yaraCount suricataCount sigmaCount
      skipped { reason count }
    }
  }
`;

export interface GenerateRulesResult {
  yaraCount: number;
  suricataCount: number;
  sigmaCount: number;
  skipped: { reason: string; count: number }[];
}

export function useGenerateRulesFromHunt() {
  const { mutate, loading, error } = useMutation<
    { generateRulesFromHunt: GenerateRulesResult },
    { huntId: string }
  >(GENERATE_RULES_FROM_HUNT, () => ({
    refetchQueries: ['DetectionRules'],
  }));
  return {
    submit: async (huntId: string) => (await mutate({ huntId }))?.data?.generateRulesFromHunt ?? null,
    loading, error,
  };
}

// H2.2 — Pack hunt rules as zip + trigger browser download.
const PACK_HUNT_RULES_AS_ZIP = gql`
  mutation PackHuntRulesAsZip($huntId: ID!) {
    packHuntRulesAsZip(huntId: $huntId) {
      filename base64 ruleCount yaraCount suricataCount sigmaCount
    }
  }
`;

export interface PackedRulesZip {
  filename: string;
  base64: string;
  ruleCount: number;
  yaraCount: number;
  suricataCount: number;
  sigmaCount: number;
}

// Decode base64 → Blob → click invisible <a download>. Stays in browser
// memory; no localStorage. Caller handles toast + error states.
// mimeType defaults to 'application/zip' for back-compat with H2.2 zip path.
function triggerBrowserDownload(
  filename: string,
  base64: string,
  mimeType: string = 'application/zip',
): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useDownloadHuntZip() {
  const { mutate, loading, error } = useMutation<
    { packHuntRulesAsZip: PackedRulesZip },
    { huntId: string }
  >(PACK_HUNT_RULES_AS_ZIP);
  return {
    submit: async (huntId: string): Promise<PackedRulesZip | null> => {
      const r = await mutate({ huntId });
      const packed = r?.data?.packHuntRulesAsZip ?? null;
      if (packed) triggerBrowserDownload(packed.filename, packed.base64);
      return packed;
    },
    loading, error,
  };
}

// Hunt raw-IOC export — OpenIOC 1.1 XML or plain typed list. Distinct
// from STIX (rule-derived); this is the observed-artifact IOC feed.
const EXPORT_HUNT_IOCS = gql`
  mutation ExportHuntIocs($huntId: ID!, $format: HuntIocFormat!) {
    exportHuntIocs(huntId: $huntId, format: $format) {
      filename base64 iocCount format tlp
    }
  }
`;

export type HuntIocFormat = 'OPENIOC' | 'PLAIN';
export interface HuntIocExport {
  filename: string;
  base64: string;
  iocCount: number;
  format: HuntIocFormat;
  tlp: string;
}

export function useExportHuntIocs() {
  const { mutate, loading, error } = useMutation<
    { exportHuntIocs: HuntIocExport },
    { huntId: string; format: HuntIocFormat }
  >(EXPORT_HUNT_IOCS);
  return {
    submit: async (huntId: string, format: HuntIocFormat): Promise<HuntIocExport | null> => {
      const r = await mutate({ huntId, format });
      const ex = r?.data?.exportHuntIocs ?? null;
      if (ex) {
        triggerBrowserDownload(
          ex.filename,
          ex.base64,
          format === 'OPENIOC' ? 'application/xml' : 'text/plain',
        );
      }
      return ex;
    },
    loading, error,
  };
}

// F1c+ — Hunt push readiness: per-rule × per-tier matrix + summary.
const HUNT_PUSH_READINESS = gql`
  query HuntPushReadiness($huntId: ID!) {
    huntPushReadiness(huntId: $huntId) {
      summary {
        totalRules approvedCount staleCount unapprovedCount
        shipCountPublic shipCountCrossAgency shipCountSectoral shipCountInternal
      }
      rows {
        ruleId ruleName ruleKind ruleTier approvalState
        public       { allowed reason }
        crossAgency  { allowed reason }
        sectoral     { allowed reason }
        internal     { allowed reason }
      }
    }
  }
`;

export interface HuntPushReadinessSummary {
  totalRules: number;
  approvedCount: number;
  staleCount: number;
  unapprovedCount: number;
  shipCountPublic: number;
  shipCountCrossAgency: number;
  shipCountSectoral: number;
  shipCountInternal: number;
}

export interface HuntPushReadinessRow {
  ruleId: string;
  ruleName: string;
  ruleKind: 'YARA' | 'SURICATA' | 'SIGMA' | 'CUSTOM';
  ruleTier: import('./useRules').ReleaseTier;
  approvalState: 'approved' | 'stale' | 'unapproved';
  public:      { allowed: boolean; reason: string | null };
  crossAgency: { allowed: boolean; reason: string | null };
  sectoral:    { allowed: boolean; reason: string | null };
  internal:    { allowed: boolean; reason: string | null };
}

export function useHuntPushReadiness(huntId: () => string | null) {
  const { result, loading, error, refetch } = useQuery<{
    huntPushReadiness: { summary: HuntPushReadinessSummary; rows: HuntPushReadinessRow[] };
  }>(
    HUNT_PUSH_READINESS,
    () => ({ huntId: huntId() ?? '' }),
    () => ({ enabled: Boolean(huntId()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    summary: computed(() => result.value?.huntPushReadiness?.summary ?? null),
    rows:    computed(() => result.value?.huntPushReadiness?.rows ?? []),
    loading, error,
    refetch: () => { refetch(); },
  };
}

// H5.5 — Past STIX exports for a hunt. Newest-first; signature truncated.
const RECENT_STIX_EXPORTS = gql`
  query RecentStixExports($huntId: ID!, $limit: Int) {
    recentStixExports(huntId: $huntId, limit: $limit) {
      id ts bundleId indicatorCount tlp releaseTier bytesSize contentHash
      signaturePrefix signatureAlgorithm signedByKeypairId
    }
  }
`;

export interface StixExportRow {
  id: string;
  ts: string;
  bundleId: string;
  indicatorCount: number;
  tlp: 'white' | 'green' | 'amber' | 'red';
  releaseTier: import('./useRules').ReleaseTier;
  bytesSize: number;
  contentHash: string;
  signaturePrefix: string;
  signatureAlgorithm: string;
  signedByKeypairId: string | null;
}

export function useRecentStixExports(huntId: () => string | null) {
  const { result, loading, error, refetch } = useQuery<{ recentStixExports: StixExportRow[] }>(
    RECENT_STIX_EXPORTS,
    () => ({ huntId: huntId() ?? '', limit: 10 }),
    () => ({ enabled: Boolean(huntId()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    exports: computed(() => result.value?.recentStixExports ?? []),
    loading, error,
    refetch: () => { refetch(); },
  };
}

// H5 — Pack hunt approved rules as STIX 2.1 Bundle + browser download.
// Only F2-approved + non-stale rules export. TLP marking-def derived
// from Hunt.releaseTier.
const EXPORT_HUNT_AS_STIX = gql`
  mutation ExportHuntAsStix($huntId: ID!) {
    exportHuntAsStix(huntId: $huntId) {
      exportId filename base64 bundleId
      indicatorCount skippedUnapproved skippedStale
      tlp contentHash
      signature signatureAlgorithm signedByKeypairId signerPublicKeyPem
    }
  }
`;

export interface StixExportResult {
  exportId: string;
  filename: string;
  base64: string;
  bundleId: string;
  indicatorCount: number;
  skippedUnapproved: number;
  skippedStale: number;
  tlp: 'white' | 'green' | 'amber' | 'red';
  contentHash: string;
  // F2 — detached Ed25519 signature provenance.
  signature: string;
  signatureAlgorithm: string;
  signedByKeypairId: string;
  signerPublicKeyPem: string;
}

export function useExportHuntAsStix() {
  const { mutate, loading, error } = useMutation<
    { exportHuntAsStix: StixExportResult },
    { huntId: string }
  >(EXPORT_HUNT_AS_STIX);
  return {
    submit: async (huntId: string): Promise<StixExportResult | null> => {
      const r = await mutate({ huntId });
      const stix = r?.data?.exportHuntAsStix ?? null;
      if (stix) triggerBrowserDownload(stix.filename, stix.base64, 'application/json');
      return stix;
    },
    loading, error,
  };
}

// Hunt detail extended w/ snapshot fields for graph-kind hunts.
const HUNT_GRAPH_DETAIL = gql`
  query HuntGraphDetail($id: ID!) {
    hunt(id: $id) {
      id name kind status releaseTier redactionProfileId createdAt updatedAt
      graphSnapshot graphSeedType graphSeedId
    }
  }
`;

export interface HuntGraphDetail {
  id: string;
  name: string;
  kind: 'STRUCTURED' | 'GRAPH';
  status: 'ACTIVE' | 'ARCHIVED';
  releaseTier: import('./useRules').ReleaseTier;  // F1b — re-use rule's tier type
  redactionProfileId: string | null;               // F3a — null = full bundle
  createdAt: string;
  updatedAt: string;
  graphSnapshot: string | null;
  graphSeedType: string | null;
  graphSeedId: string | null;
}

const SET_HUNT_RELEASE_TIER = gql`
  mutation SetHuntReleaseTier($id: ID!, $tier: ReleaseTier!) {
    setHuntReleaseTier(id: $id, tier: $tier) {
      id releaseTier updatedAt
    }
  }
`;

export function useSetHuntReleaseTier() {
  type T = import('./useRules').ReleaseTier;
  const { mutate, loading, error } = useMutation<
    { setHuntReleaseTier: { id: string; releaseTier: T; updatedAt: string } },
    { id: string; tier: T }
  >(SET_HUNT_RELEASE_TIER, () => ({
    refetchQueries: ['HuntGraphDetail'],
    awaitRefetchQueries: true,
  }));
  return {
    submit: async (id: string, tier: T) =>
      (await mutate({ id, tier }))?.data?.setHuntReleaseTier ?? null,
    loading, error,
  };
}

export function useHuntGraph(id: () => string | null | undefined) {
  const { result, loading, error, refetch } = useQuery<{ hunt: HuntGraphDetail | null }>(
    HUNT_GRAPH_DETAIL,
    () => ({ id: id() ?? '' }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  const hunt = computed(() => result.value?.hunt ?? null);
  return { hunt, loading, error, refetch };
}

// H3 — TTP-seed materialize. Two-mode: facets-only (cheap count-first
// for the picker preview), then proceedToGraph=true for the canvas.
const MATERIALIZE_TTP_HUNT = gql`
  mutation MaterializeTtpHunt($input: TtpMaterializeInput!) {
    materializeTtpHunt(input: $input) {
      facets {
        techniqueId techniqueName
        actorCount stakeholderCount assetCount ruleCount artifactCount totalNodes
      }
      graphSnapshot
      capped
      cap
    }
  }
`;

export interface TtpFacets {
  techniqueId: string;
  techniqueName: string | null;
  actorCount: number;
  stakeholderCount: number;
  assetCount: number;
  ruleCount: number;
  artifactCount: number;
  totalNodes: number;
}

export interface TtpMaterializeResult {
  facets: TtpFacets;
  graphSnapshot: string | null;
  capped: boolean;
  cap: number;
}

export interface TtpMaterializeInput {
  techniqueId: string;
  actorId?: string | null;
  stakeholderIds?: string[] | null;
  proceedToGraph?: boolean;
  capPerType?: number;
}

export function useTtpMaterialize() {
  const { mutate, loading, error } = useMutation<
    { materializeTtpHunt: TtpMaterializeResult },
    { input: TtpMaterializeInput }
  >(MATERIALIZE_TTP_HUNT);
  return {
    submit: async (input: TtpMaterializeInput): Promise<TtpMaterializeResult | null> => {
      const r = await mutate({ input });
      return r?.data?.materializeTtpHunt ?? null;
    },
    loading, error,
  };
}
