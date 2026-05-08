import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';

export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type CaseVerdict = 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN' | 'PENDING';

export interface CaseSummary {
  id: string;
  reportNo: string;
  title: string | null;
  trigger: string | null;
  summary: string | null;
  status: CaseStatus;
  verdict: CaseVerdict | null;
  deployedAt: string;
  closedAt: string | null;
  artifactCount: number;
  stakeholder: Pick<Stakeholder, 'id' | 'slug' | 'name' | 'city'>;
}

export interface CaseInput {
  reportNo: string;
  title?: string;
  trigger?: string;
  summary?: string;
  stakeholderId: string;
  leadUserId?: string;
  deployedAt: string;
  status?: CaseStatus;
}

export interface CasesFilter {
  stakeholderId?: string | null;
  status?: CaseStatus[] | null;
  search?: string | null;
  offset?: number | null;
}

const CASES = gql`
  query Cases($stakeholderId: ID, $status: [CaseStatus!], $search: String, $first: Int = 100, $offset: Int = 0) {
    cases(stakeholderId: $stakeholderId, status: $status, search: $search, first: $first, offset: $offset) {
      id reportNo title status verdict deployedAt closedAt artifactCount
      stakeholder { id slug name city }
    }
  }
`;

const CREATE_CASE = gql`
  mutation CreateCase($input: CaseInput!) {
    createCase(input: $input) {
      id reportNo title status verdict deployedAt artifactCount
      stakeholder { id slug name city }
    }
  }
`;

export function useCases(filter: () => CasesFilter): {
  cases: ComputedRef<CaseSummary[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
} {
  const { result, loading, error, refetch } = useQuery<{ cases: CaseSummary[] }>(
    CASES,
    () => ({
      stakeholderId: filter().stakeholderId ?? null,
      status: filter().status && filter().status!.length > 0 ? filter().status : null,
      search: filter().search ?? null,
      first: 100,
      offset: filter().offset ?? 0,
    }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  return {
    cases: computed(() => result.value?.cases ?? []),
    loading,
    error,
    refetch: () => { refetch(); },
  };
}

export function useCreateCase() {
  const { mutate, loading, error } = useMutation<{ createCase: CaseSummary }, { input: CaseInput }>(CREATE_CASE);
  async function submit(input: CaseInput): Promise<CaseSummary | null> {
    const r = await mutate({ input });
    return r?.data?.createCase ?? null;
  }
  return { submit, loading, error };
}
