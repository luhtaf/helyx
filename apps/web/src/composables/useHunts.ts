import { computed } from 'vue';
import { useMutation, useQuery } from '@vue/apollo-composable';
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
