import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { CaseSummary } from './useCases';

export interface ArtifactCounts {
  ioc: number;
  file: number;
  process: number;
  network: number;
  registry: number;
  persistence: number;
  account: number;
  logFinding: number;
  memory: number;
  detectionHit: number;
  note: number;
}

export interface CaseDetail extends CaseSummary {
  trigger: string | null;
  summary: string | null;
  artifactsByType: ArtifactCounts;
}

const CASE = gql`
  query Case($id: ID!) {
    case(id: $id) {
      id reportNo title trigger summary status verdict deployedAt closedAt artifactCount
      stakeholder { id slug name city }
      artifactsByType {
        ioc file process network registry persistence account
        logFinding memory detectionHit note
      }
    }
  }
`;

/**
 * Fetch single Case with artifactsByType counts.
 *
 * IMPORTANT: Consumers MUST call refetch() after any artifact mutation —
 * tab counts will otherwise stay stale until cache TTL or page reload.
 * Subscription-based live counts may land in v2.
 */
const CLOSE_CASE = gql`
  mutation CloseCase($id: ID!, $verdict: CaseVerdict!) {
    closeCase(id: $id, verdict: $verdict) {
      id status verdict closedAt
    }
  }
`;

type CaseVerdict = 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN';

interface CloseCaseResult {
  id: string;
  status: 'CLOSED';
  verdict: CaseVerdict;
  closedAt: string;
}

export function useCloseCase(): {
  submit: (id: string, verdict: CaseVerdict) => Promise<{ ok: boolean; error: string | null; data: CloseCaseResult | null }>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { mutate, loading, error } = useMutation<
    { closeCase: CloseCaseResult },
    { id: string; verdict: CaseVerdict }
  >(CLOSE_CASE);

  async function submit(
    id: string,
    verdict: CaseVerdict,
  ): Promise<{ ok: boolean; error: string | null; data: CloseCaseResult | null }> {
    try {
      const r = await mutate({ id, verdict });
      return { ok: true, error: null, data: r?.data?.closeCase ?? null };
    } catch (e) {
      return { ok: false, error: (e as Error).message, data: null };
    }
  }
  return { submit, loading, error };
}

export function useCase(id: () => string): {
  case: ComputedRef<CaseDetail | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
} {
  const { result, loading, error, refetch } = useQuery<{ case: CaseDetail | null }>(
    CASE,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    case: computed(() => result.value?.case ?? null),
    loading,
    error,
    refetch: () => { refetch(); },
  };
}
