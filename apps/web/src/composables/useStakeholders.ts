// apps/web/src/composables/useStakeholders.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation, useApolloClient } from '@vue/apollo-composable';
import gql from 'graphql-tag';
export { type SensorStack, type SensorStatus, type StakeholderStatus } from './stakeholder-kinds';
import type { SensorStack, SensorStatus, StakeholderStatus } from './stakeholder-kinds';

export interface Sektor {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  stakeholderCount: number;
}

export interface SensorSummary {
  stack: SensorStack | null;
  status: SensorStatus | null;
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
  status: StakeholderStatus;
  sektor: Sektor | null;
  sensor: SensorSummary;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholdersFilter {
  sektorId?: string | null;
  status?: StakeholderStatus | null;
  search?: string | null;
}

const SEKTORS = gql`
  query Sektors {
    sektors { id slug name displayOrder stakeholderCount }
  }
`;

const STAKEHOLDER_AUTOCOMPLETE = gql`
  query StakeholderAutocomplete($search: String!) {
    stakeholders(search: $search, first: 10) { id name slug }
  }
`;

export interface StakeholderHit {
  id: string;
  name: string;
  slug: string;
}

// Lazy autocomplete (caller debounces). no-cache so each keystroke is
// fresh. Used by the asset-add owner picker.
export function useStakeholderAutocomplete() {
  const { client } = useApolloClient();
  return {
    async search(q: string): Promise<StakeholderHit[]> {
      if (q.trim().length < 2) return [];
      const r = await client.query<{ stakeholders: StakeholderHit[] }>({
        query: STAKEHOLDER_AUTOCOMPLETE,
        variables: { search: q.trim() },
        fetchPolicy: 'no-cache',
      });
      return r.data?.stakeholders ?? [];
    },
  };
}

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

const UPDATE_STAKEHOLDER = gql`
  mutation UpdateStakeholder($id: ID!, $input: StakeholderUpdateInput!) {
    updateStakeholder(id: $id, input: $input) {
      id slug name aliases city coords notes status
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

export interface StakeholderUpdateInput {
  name?: string;
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

export function useUpdateStakeholder(): {
  submit: (id: string, input: StakeholderUpdateInput) => Promise<Stakeholder | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { mutate, loading, error } = useMutation<
    { updateStakeholder: Stakeholder },
    { id: string; input: StakeholderUpdateInput }
  >(UPDATE_STAKEHOLDER, () => ({
    refetchQueries: ['Stakeholders', 'Stakeholder', 'Sektors'],
    awaitRefetchQueries: true,
  }));
  async function submit(id: string, input: StakeholderUpdateInput): Promise<Stakeholder | null> {
    const r = await mutate({ id, input });
    return r?.data?.updateStakeholder ?? null;
  }
  return { submit, loading, error };
}

// ─── CSV bulk import ───────────────────────────────────────────────

const BULK_IMPORT_STAKEHOLDERS = gql`
  mutation BulkImportStakeholders($csv: String!) {
    bulkImportStakeholders(csv: $csv) {
      created
      skipped
      errors { line reason }
    }
  }
`;

export interface StakeholderImportResult {
  created: number;
  skipped: number;
  errors: { line: number; reason: string }[];
}

export function useBulkImportStakeholders(): {
  submit: (csv: string) => Promise<StakeholderImportResult | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { mutate, loading, error } = useMutation<
    { bulkImportStakeholders: StakeholderImportResult },
    { csv: string }
  >(BULK_IMPORT_STAKEHOLDERS, () => ({
    refetchQueries: ['Stakeholders', 'Sektors'],
    awaitRefetchQueries: true,
  }));
  async function submit(csv: string): Promise<StakeholderImportResult | null> {
    try {
      const r = await mutate({ csv });
      return r?.data?.bulkImportStakeholders ?? null;
    } catch {
      return null;
    }
  }
  return { submit, loading, error };
}

// ─── Sensor input (per-stakeholder) ────────────────────────────────
// SensorStack/SensorStatus already imported at top of file.

export interface SensorInput {
  stack?: SensorStack | null;
  status?: SensorStatus | null;
  agentCount?: number | null;
  deployedAt?: string | null;
  notes?: string | null;
}

const SET_STAKEHOLDER_SENSOR = gql`
  mutation SetStakeholderSensor($id: ID!, $input: SensorInput!) {
    setStakeholderSensor(id: $id, input: $input) {
      id
      sensor { stack status agentCount deployedAt notes }
    }
  }
`;

export function useSetStakeholderSensor() {
  const { mutate, loading, error } = useMutation<
    { setStakeholderSensor: Stakeholder },
    { id: string; input: SensorInput }
  >(SET_STAKEHOLDER_SENSOR, () => ({
    refetchQueries: ['Stakeholders', 'Stakeholder'],
    awaitRefetchQueries: true,
  }));
  async function submit(id: string, input: SensorInput): Promise<Stakeholder | null> {
    const r = await mutate({ id, input });
    return r?.data?.setStakeholderSensor ?? null;
  }
  return { submit, loading, error };
}
