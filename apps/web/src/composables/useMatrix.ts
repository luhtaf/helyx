import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const MATRIX = gql`
  query Matrix($filter: MatrixFilter) {
    matrix(filter: $filter) {
      tactic { id name shortname description url ordering techniqueCount }
      techniques { id name isSubtechnique parentTechniqueId }
    }
  }
`;

export interface MatrixColumn {
  tactic: {
    id: string;
    name: string;
    shortname: string;
    description: string | null;
    url: string | null;
    ordering: number;
    techniqueCount: number;
  };
  techniques: {
    id: string;
    name: string;
    isSubtechnique: boolean;
    parentTechniqueId: string | null;
  }[];
}

export function useMatrix(filter: () => { platform: string | null; search: string | null }): {
  columns: ComputedRef<MatrixColumn[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ matrix: MatrixColumn[] }>(
    MATRIX,
    () => ({ filter: filter() }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );

  const columns = computed(() => result.value?.matrix ?? []);
  return { columns, loading, error };
}
