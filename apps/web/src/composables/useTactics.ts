import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const TACTIC_DETAIL = gql`
  query TacticDetail($id: ID!) {
    tactic(id: $id) {
      id
      name
      shortname
      description
      url
      ordering
      techniqueCount
      techniques {
        id
        name
        description
        isSubtechnique
        platforms
        killChainPhases
      }
      topActors(limit: 25) {
        id
        name
        techniqueCount
        techniquesInTacticCount
      }
    }
  }
`;

export interface TacticDetail {
  id: string;
  name: string;
  shortname: string;
  description: string | null;
  url: string | null;
  ordering: number;
  techniqueCount: number;
  techniques: {
    id: string;
    name: string;
    description: string | null;
    isSubtechnique: boolean;
    platforms: string[];
    killChainPhases: string[];
  }[];
  topActors: {
    id: string;
    name: string;
    techniqueCount: number;
    techniquesInTacticCount: number;
  }[];
}

export function useTacticDetail(id: () => string): {
  tactic: ComputedRef<TacticDetail | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ tactic: TacticDetail | null }>(
    TACTIC_DETAIL,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );

  const tactic = computed(() => result.value?.tactic ?? null);
  return { tactic, loading, error };
}
