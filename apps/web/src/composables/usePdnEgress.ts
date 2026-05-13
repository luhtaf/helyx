// F3b — PDN egress allowlist composables. List/add/disable/enable +
// pre-flight URL check. Add/disable/enable are OWNER-only mutations.

import { computed, ref } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export const EGRESS_STATUSES = ['active', 'disabled'] as const;
export type EgressStatus = (typeof EGRESS_STATUSES)[number];

export interface PdnEgressEntry {
  id: string;
  hostname: string;
  label: string;
  status: EgressStatus;
  addedByUserId: string;
  addedByEmail: string | null;
  createdAt: string;
  disabledAt: string | null;
  disabledByUserId: string | null;
}

const ENTRY_FIELDS = `
  id hostname label status
  addedByUserId addedByEmail
  createdAt disabledAt disabledByUserId
`;

const LIST_QUERY = gql`
  query PdnEgressEntries {
    pdnEgressEntries { ${ENTRY_FIELDS} }
  }
`;

const CHECK_QUERY = gql`
  query CheckPdnEgress($url: String!) {
    checkPdnEgress(url: $url) { hostname allowed reason }
  }
`;

const ADD_MUTATION = gql`
  mutation AddPdnEgressEntry($hostname: String!, $label: String!) {
    addPdnEgressEntry(hostname: $hostname, label: $label) { ${ENTRY_FIELDS} }
  }
`;

const DISABLE_MUTATION = gql`
  mutation DisablePdnEgressEntry($id: ID!) {
    disablePdnEgressEntry(id: $id) { ${ENTRY_FIELDS} }
  }
`;

const ENABLE_MUTATION = gql`
  mutation EnablePdnEgressEntry($id: ID!) {
    enablePdnEgressEntry(id: $id) { ${ENTRY_FIELDS} }
  }
`;

export function usePdnEgressEntries() {
  const { result, loading, error, refetch } = useQuery<{ pdnEgressEntries: PdnEgressEntry[] }>(
    LIST_QUERY,
    null,
    { fetchPolicy: 'cache-and-network' },
  );
  const entries = computed<PdnEgressEntry[]>(() => result.value?.pdnEgressEntries ?? []);
  const active = computed<PdnEgressEntry[]>(() => entries.value.filter((e) => e.status === 'active'));
  const disabled = computed<PdnEgressEntry[]>(() => entries.value.filter((e) => e.status === 'disabled'));
  return { entries, active, disabled, loading, error, refetch };
}

export interface EgressCheck {
  hostname: string;
  allowed: boolean;
  reason: string | null;
}

export function usePdnEgressMutations() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function add(hostname: string, label: string): Promise<PdnEgressEntry | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ addPdnEgressEntry: PdnEgressEntry }>({
        mutation: ADD_MUTATION,
        variables: { hostname, label },
        refetchQueries: [{ query: LIST_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.addPdnEgressEntry ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function disable(id: string): Promise<PdnEgressEntry | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ disablePdnEgressEntry: PdnEgressEntry }>({
        mutation: DISABLE_MUTATION,
        variables: { id },
        refetchQueries: [{ query: LIST_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.disablePdnEgressEntry ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function enable(id: string): Promise<PdnEgressEntry | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ enablePdnEgressEntry: PdnEgressEntry }>({
        mutation: ENABLE_MUTATION,
        variables: { id },
        refetchQueries: [{ query: LIST_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.enablePdnEgressEntry ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function check(url: string): Promise<EgressCheck | null> {
    try {
      const r = await client.query<{ checkPdnEgress: EgressCheck }>({
        query: CHECK_QUERY,
        variables: { url },
        fetchPolicy: 'network-only',
      });
      return r.data.checkPdnEgress;
    } catch {
      return null;
    }
  }

  return { add, disable, enable, check, submitting, error };
}
