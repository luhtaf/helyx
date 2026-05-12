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
      detections {
        id
        name
        description
        dataSourceName
      }
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
  detections: { id: string; name: string; description: string | null; dataSourceName: string }[];
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

// Lightweight autocomplete query — used by guess-actor TTP picker etc.
const SEARCH_ATTACK_PATTERNS = gql`
  query SearchAttackPatterns($q: String!, $limit: Int) {
    searchAttackPatterns(q: $q, limit: $limit) {
      id
      name
      isSubtechnique
      parentTechniqueId
    }
  }
`;

export interface AttackPatternSearchHit {
  id: string;
  name: string;
  isSubtechnique: boolean;
  parentTechniqueId: string | null;
}

export function useSearchAttackPatterns(q: () => string, limit = 10) {
  const { result, loading } = useQuery<{ searchAttackPatterns: AttackPatternSearchHit[] }>(
    SEARCH_ATTACK_PATTERNS,
    () => ({ q: q().trim(), limit }),
    () => ({ enabled: q().trim().length >= 2, fetchPolicy: 'cache-first' }),
  );
  return {
    hits: computed(() => result.value?.searchAttackPatterns ?? []),
    loading,
  };
}
