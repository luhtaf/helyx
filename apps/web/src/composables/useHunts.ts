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
  const { mutate, loading, error } = useMutation<{ deleteHunt: boolean }>(DELETE_HUNT);
  async function submit(id: string): Promise<boolean> {
    const res = await mutate({ id });
    return Boolean(res?.data?.deleteHunt);
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

// Hunt detail extended w/ snapshot fields for graph-kind hunts.
const HUNT_GRAPH_DETAIL = gql`
  query HuntGraphDetail($id: ID!) {
    hunt(id: $id) {
      id name kind status createdAt updatedAt
      graphSnapshot graphSeedType graphSeedId
    }
  }
`;

export interface HuntGraphDetail {
  id: string;
  name: string;
  kind: 'STRUCTURED' | 'GRAPH';
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  graphSnapshot: string | null;
  graphSeedType: string | null;
  graphSeedId: string | null;
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
