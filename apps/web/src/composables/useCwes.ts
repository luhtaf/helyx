import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const CWE_DETAIL = gql`
  query CweDetail($id: ID!, $page: Int!) {
    cwe(id: $id) {
      id name
      cves(page: $page, perPage: 25) {
        total page perPage
        items { cveId description severity baseScore publishedAt }
      }
    }
  }
`;

export interface CweRelatedCveRow {
  cveId: string;
  description: string | null;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
}

export interface CweDetail {
  id: string;
  name: string | null;
  cves: { items: CweRelatedCveRow[]; total: number; page: number; perPage: number };
}

export function useCweDetail(id: () => string, page: () => number): {
  cwe: ComputedRef<CweDetail | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ cwe: CweDetail | null }>(
    CWE_DETAIL,
    () => ({ id: id(), page: page() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );

  const cwe = computed(() => result.value?.cwe ?? null);
  return { cwe, loading, error };
}
