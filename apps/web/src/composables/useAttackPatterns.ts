import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const ATTACK_PATTERN_DETAIL = gql`
  query AttackPatternDetail($id: ID!) {
    attackPattern(id: $id) {
      id
      name
      description
      url
      platforms
      detection
      dataSources
      killChainPhases
      isSubtechnique
      threatActors(limit: 25) {
        id
        name
        techniqueCount
      }
    }
  }
`;

export interface AttackPatternDetail {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  platforms: string[];
  detection: string | null;
  dataSources: string[];
  killChainPhases: string[];
  isSubtechnique: boolean;
  threatActors: { id: string; name: string; techniqueCount: number }[];
}

export function useAttackPatternDetail(id: () => string): {
  ap: ComputedRef<AttackPatternDetail | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ attackPattern: AttackPatternDetail | null }>(
    ATTACK_PATTERN_DETAIL,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );

  const ap = computed(() => result.value?.attackPattern ?? null);
  return { ap, loading, error };
}
