// H7/H9 — CTI push targets + push trigger composables.
// List + attempts visible to ANALYST. CRUD + push are OWNER (matches BE).

import { computed, ref } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { ReleaseTier } from './useRules';

export const PUSH_TARGET_KINDS = ['MISP', 'OPENCTI', 'TAXII', 'ECLECTICIQ'] as const;
export type PushTargetKind = (typeof PUSH_TARGET_KINDS)[number];

export const PUSH_TARGET_KIND_LABELS: Record<PushTargetKind, string> = {
  MISP: 'MISP',
  OPENCTI: 'OpenCTI',
  TAXII: 'TAXII 2.1',
  ECLECTICIQ: 'EclecticIQ',
};

export const PUSH_OUTCOMES = [
  'success', 'dry_run',
  'denied_no_approved_rules', 'denied_egress', 'denied_target_disabled',
  'failed_export', 'failed_http',
] as const;
export type PushOutcome = (typeof PUSH_OUTCOMES)[number];

export const PUSH_OUTCOME_LABELS: Record<PushOutcome, string> = {
  success: 'Success',
  dry_run: 'Dry run',
  denied_no_approved_rules: 'Denied · no approved rules',
  denied_egress: 'Denied · egress / tier',
  denied_target_disabled: 'Denied · target disabled',
  failed_export: 'Failed · export',
  failed_http: 'Failed · HTTP',
};

export interface CtiPushTarget {
  id: string;
  kind: PushTargetKind;
  label: string;
  url: string;
  maxTier: ReleaseTier;
  dryRun: boolean;
  status: 'active' | 'disabled';
  apiKeyMasked: string;
  addedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CtiPushAttempt {
  id: string;
  targetId: string;
  targetLabel: string | null;
  huntId: string;
  huntName: string | null;
  ts: string;
  outcome: PushOutcome;
  bundleContentHash: string | null;
  indicatorCount: number | null;
  errorDetail: string | null;
  actorUserId: string;
}

export interface PushHuntResult {
  attempt: CtiPushAttempt;
  bundleContentHash: string | null;
}

const TARGET_FIELDS = `
  id kind label url maxTier dryRun status apiKeyMasked
  addedByUserId createdAt updatedAt
`;

const ATTEMPT_FIELDS = `
  id targetId targetLabel huntId huntName ts outcome
  bundleContentHash indicatorCount errorDetail actorUserId
`;

const TARGETS_QUERY = gql`
  query CtiPushTargets {
    ctiPushTargets { ${TARGET_FIELDS} }
  }
`;

const ATTEMPTS_QUERY = gql`
  query CtiPushAttempts($limit: Int) {
    ctiPushAttempts(limit: $limit) { ${ATTEMPT_FIELDS} }
  }
`;

const ADD_MUTATION = gql`
  mutation AddCtiPushTarget($input: CreatePushTargetInput!) {
    addCtiPushTarget(input: $input) { ${TARGET_FIELDS} }
  }
`;

const DISABLE_MUTATION = gql`
  mutation DisableCtiPushTarget($id: ID!) {
    disableCtiPushTarget(id: $id) { ${TARGET_FIELDS} }
  }
`;

const ENABLE_MUTATION = gql`
  mutation EnableCtiPushTarget($id: ID!) {
    enableCtiPushTarget(id: $id) { ${TARGET_FIELDS} }
  }
`;

const PUSH_MUTATION = gql`
  mutation PushHuntToTarget($huntId: ID!, $targetId: ID!) {
    pushHuntToTarget(huntId: $huntId, targetId: $targetId) {
      bundleContentHash
      attempt { ${ATTEMPT_FIELDS} }
    }
  }
`;

export function useCtiPushTargets() {
  const { result, loading, error, refetch } = useQuery<{ ctiPushTargets: CtiPushTarget[] }>(
    TARGETS_QUERY,
    null,
    { fetchPolicy: 'cache-and-network' },
  );
  const targets = computed<CtiPushTarget[]>(() => result.value?.ctiPushTargets ?? []);
  const active = computed(() => targets.value.filter((t) => t.status === 'active'));
  const disabled = computed(() => targets.value.filter((t) => t.status === 'disabled'));
  return { targets, active, disabled, loading, error, refetch };
}

export function useCtiPushAttempts(limit = 50) {
  const { result, loading, error, refetch } = useQuery<{ ctiPushAttempts: CtiPushAttempt[] }>(
    ATTEMPTS_QUERY,
    { limit },
    { fetchPolicy: 'cache-and-network' },
  );
  const attempts = computed<CtiPushAttempt[]>(() => result.value?.ctiPushAttempts ?? []);
  return { attempts, loading, error, refetch };
}

export interface CreatePushTargetInput {
  kind: PushTargetKind;
  label: string;
  url: string;
  maxTier: ReleaseTier;
  apiKey: string;
  dryRun: boolean;
}

export function useCtiPushMutations() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function add(input: CreatePushTargetInput): Promise<CtiPushTarget | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ addCtiPushTarget: CtiPushTarget }>({
        mutation: ADD_MUTATION,
        variables: { input },
        refetchQueries: [{ query: TARGETS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.addCtiPushTarget ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function disable(id: string): Promise<CtiPushTarget | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ disableCtiPushTarget: CtiPushTarget }>({
        mutation: DISABLE_MUTATION,
        variables: { id },
        refetchQueries: [{ query: TARGETS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.disableCtiPushTarget ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function enable(id: string): Promise<CtiPushTarget | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ enableCtiPushTarget: CtiPushTarget }>({
        mutation: ENABLE_MUTATION,
        variables: { id },
        refetchQueries: [{ query: TARGETS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.enableCtiPushTarget ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function push(huntId: string, targetId: string): Promise<PushHuntResult | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ pushHuntToTarget: PushHuntResult }>({
        mutation: PUSH_MUTATION,
        variables: { huntId, targetId },
        refetchQueries: [{ query: ATTEMPTS_QUERY, variables: { limit: 50 } }],
        awaitRefetchQueries: true,
      });
      return r.data?.pushHuntToTarget ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  return { add, disable, enable, push, submitting, error };
}
