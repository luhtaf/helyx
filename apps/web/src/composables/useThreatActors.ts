import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const TA_LIST = gql`
  query ThreatActors($search: String, $page: Int, $perPage: Int) {
    threatActors(search: $search, page: $page, perPage: $perPage) {
      total
      page
      perPage
      items {
        id
        name
        description
        aliases
        techniqueCount
      }
    }
  }
`;

const TA_DETAIL = gql`
  query ThreatActorDetail($id: ID!) {
    threatActor(id: $id) {
      id
      name
      description
      aliases
      url
      createdAt
      modifiedAt
      techniqueCount
      techniques {
        id
        name
        url
        platforms
        killChainPhases
        isSubtechnique
      }
    }
  }
`;

export interface ThreatActorListItem {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  techniqueCount: number;
}

export interface ThreatActorListPage {
  total: number;
  page: number;
  perPage: number;
  items: ThreatActorListItem[];
}

export interface AttackPatternRef {
  id: string;
  name: string;
  url: string | null;
  platforms: string[];
  killChainPhases: string[];
  isSubtechnique: boolean;
}

export interface ThreatActorDetail {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  url: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  techniqueCount: number;
  techniques: AttackPatternRef[];
}

export function useThreatActorsList(opts: {
  search: () => string | null;
  page: () => number;
  perPage: () => number;
}) {
  const { result, loading, error } = useQuery<{ threatActors: ThreatActorListPage }>(
    TA_LIST,
    () => ({
      search: opts.search() || null,
      page: opts.page(),
      perPage: opts.perPage(),
    }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  const data = computed(() => result.value?.threatActors ?? null);
  return { data, loading, error };
}

export function useThreatActorDetail(id: () => string) {
  const { result, loading, error } = useQuery<{ threatActor: ThreatActorDetail | null }>(
    TA_DETAIL,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  const ta = computed(() => result.value?.threatActor ?? null);
  return { ta, loading, error };
}
