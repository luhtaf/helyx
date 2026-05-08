// apps/web/src/composables/useStakeholders.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export interface Sektor {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  stakeholderCount: number;
}

export interface SensorSummary {
  stack: 'WAZUH_FULL' | 'ELK_FULL' | 'WAZUH_AGENT' | 'MIXED' | null;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | null;
  agentCount: number | null;
  deployedAt: string | null;
  notes: string | null;
}

export interface Stakeholder {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  city: string | null;
  coords: [number, number] | null;
  notes: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  sektor: Sektor | null;
  sensor: SensorSummary;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholdersFilter {
  sektorId?: string | null;
  status?: 'ACTIVE' | 'ARCHIVED' | null;
  search?: string | null;
}

const SEKTORS = gql`
  query Sektors {
    sektors { id slug name displayOrder stakeholderCount }
  }
`;

const STAKEHOLDERS = gql`
  query Stakeholders($sektorId: ID, $status: StakeholderStatus, $search: String, $first: Int = 100) {
    stakeholders(sektorId: $sektorId, status: $status, search: $search, first: $first) {
      id slug name aliases city coords status
      sektor { id slug name }
      sensor { stack status agentCount deployedAt }
    }
  }
`;

const CREATE_STAKEHOLDER = gql`
  mutation CreateStakeholder($input: StakeholderInput!) {
    createStakeholder(input: $input) {
      id slug name aliases city coords status
      sektor { id slug name }
      sensor { stack status }
    }
  }
`;

export function useSektors(): {
  sektors: ComputedRef<Sektor[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ sektors: Sektor[] }>(SEKTORS, undefined, {
    fetchPolicy: 'cache-first',
  });
  return {
    sektors: computed(() => result.value?.sektors ?? []),
    loading,
    error,
  };
}

export function useStakeholders(filter: () => StakeholdersFilter): {
  stakeholders: ComputedRef<Stakeholder[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
} {
  const { result, loading, error, refetch } = useQuery<{ stakeholders: Stakeholder[] }>(
    STAKEHOLDERS,
    () => ({
      sektorId: filter().sektorId ?? null,
      status: filter().status ?? null,
      search: filter().search ?? null,
      first: 100,
    }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  return {
    stakeholders: computed(() => result.value?.stakeholders ?? []),
    loading,
    error,
    refetch: () => { refetch(); },
  };
}

export interface StakeholderInput {
  slug: string;
  name: string;
  aliases?: string[];
  city?: string;
  coords?: [number, number];
  notes?: string;
  sektorId?: string;
}

export function useCreateStakeholder(): {
  submit: (input: StakeholderInput) => Promise<Stakeholder | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { mutate, loading, error } = useMutation<
    { createStakeholder: Stakeholder },
    { input: StakeholderInput }
  >(CREATE_STAKEHOLDER, () => ({
    refetchQueries: ['Stakeholders', 'Sektors'],
    awaitRefetchQueries: true,
  }));
  async function submit(input: StakeholderInput): Promise<Stakeholder | null> {
    const r = await mutate({ input });
    return r?.data?.createStakeholder ?? null;
  }
  return { submit, loading, error };
}
