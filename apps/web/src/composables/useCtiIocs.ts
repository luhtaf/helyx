import { computed, type ComputedRef, type Ref } from 'vue';
import { useMutation, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

// W2.5 — Tenant intel-pool IOCs attributed to (Actor × TTP) pairs.
// Surfaces in NodeDetailDrawer when graph is in actor-scoped TTP mode.

export type CtiIocType = 'IP' | 'DOMAIN' | 'URL' | 'EMAIL' | 'HASH';

export interface CtiIoc {
  id: string;
  iocType: CtiIocType;
  value: string;
  notes: string | null;
  source: string | null;
  addedByUserId: string;
  addedAt: string;
  actorId: string;
  actorName: string;
  techniqueId: string;
  techniqueName: string;
}

const INDICATORS_FOR_ACTOR_TTP = gql`
  query IndicatorsForActorTtp($actorId: ID!, $techniqueId: String!) {
    indicatorsForActorTtp(actorId: $actorId, techniqueId: $techniqueId) {
      id iocType value notes source addedByUserId addedAt
      actorId actorName techniqueId techniqueName
    }
  }
`;

const ADD_CTI_IOC = gql`
  mutation AddCtiIoc($input: AddCtiIocInput!) {
    addCtiIoc(input: $input) {
      id iocType value notes source addedByUserId addedAt
      actorId actorName techniqueId techniqueName
    }
  }
`;

const ADD_CTI_IOCS_BULK = gql`
  mutation AddCtiIocsBulk($input: AddCtiIocsBulkInput!) {
    addCtiIocsBulk(input: $input) { added duplicates invalid }
  }
`;

const DELETE_CTI_IOC = gql`
  mutation DeleteCtiIoc($id: ID!) {
    deleteCtiIoc(id: $id)
  }
`;

export function useActorTtpIndicators(
  actorId: () => string | null | undefined,
  techniqueId: () => string | null | undefined,
): {
  indicators: ComputedRef<CtiIoc[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
} {
  const enabled = computed(() => Boolean(actorId() && techniqueId()));
  const { result, loading, error, refetch } = useQuery<{ indicatorsForActorTtp: CtiIoc[] }>(
    INDICATORS_FOR_ACTOR_TTP,
    () => ({ actorId: actorId() ?? '', techniqueId: techniqueId() ?? '' }),
    () => ({ enabled: enabled.value, fetchPolicy: 'cache-and-network' as const }),
  );
  return {
    indicators: computed(() => result.value?.indicatorsForActorTtp ?? []),
    loading,
    error,
    refetch: () => { refetch(); },
  };
}

export interface AddCtiIocInput {
  iocType: CtiIocType;
  value: string;
  notes?: string | null;
  source?: string | null;
  actorId: string;
  techniqueId: string;
}

export function useAddCtiIoc() {
  const { mutate, loading, error } = useMutation<
    { addCtiIoc: CtiIoc },
    { input: AddCtiIocInput }
  >(ADD_CTI_IOC, () => ({
    refetchQueries: ['IndicatorsForActorTtp'],
    awaitRefetchQueries: true,
  }));
  return {
    submit: async (input: AddCtiIocInput): Promise<CtiIoc | null> =>
      (await mutate({ input }))?.data?.addCtiIoc ?? null,
    loading, error,
  };
}

export interface AddCtiIocsBulkInput {
  iocType: CtiIocType;
  values: string[];
  notes?: string | null;
  source?: string | null;
  actorId: string;
  techniqueId: string;
}

export interface BulkAddResult {
  added: number;
  duplicates: number;
  invalid: number;
}

export function useAddCtiIocsBulk() {
  const { mutate, loading, error } = useMutation<
    { addCtiIocsBulk: BulkAddResult },
    { input: AddCtiIocsBulkInput }
  >(ADD_CTI_IOCS_BULK, () => ({
    refetchQueries: ['IndicatorsForActorTtp'],
    awaitRefetchQueries: true,
  }));
  return {
    submit: async (input: AddCtiIocsBulkInput): Promise<BulkAddResult | null> =>
      (await mutate({ input }))?.data?.addCtiIocsBulk ?? null,
    loading, error,
  };
}

export function useDeleteCtiIoc() {
  const { mutate, loading, error } = useMutation<{ deleteCtiIoc: boolean }, { id: string }>(
    DELETE_CTI_IOC,
    () => ({ refetchQueries: ['IndicatorsForActorTtp'], awaitRefetchQueries: true }),
  );
  return {
    submit: async (id: string): Promise<boolean> =>
      Boolean((await mutate({ id }))?.data?.deleteCtiIoc),
    loading, error,
  };
}

export const CTI_IOC_TYPES: CtiIocType[] = ['IP', 'DOMAIN', 'URL', 'EMAIL', 'HASH'];
