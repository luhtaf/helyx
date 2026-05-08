// apps/web/src/composables/useReconciliationInbox.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder, StakeholderInput } from './useStakeholders';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReconciliationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface StakeholderSuggestion {
  stakeholder: Stakeholder;
  confidence: number;
  reason: string;
}

export interface RawStakeholder {
  id: string;
  source: string;
  rawName: string;
  rawSektor: string | null;
  hitCount: number;
  targetCount: number;
  lastSeen: string;
  status: ReconciliationStatus;
  confidence: number | null;
  resolvedTo: Stakeholder | null;
  resolvedAt: string | null;
  suggestions: StakeholderSuggestion[];
}

export interface RawStakeholderCounts {
  pending: number;
  approved: number;
  rejected: number;
  needsReview: number;
}

// ── GQL documents ─────────────────────────────────────────────────────────────

const RAW_STAKEHOLDERS = gql`
  query RawStakeholders($status: ReconciliationStatus = PENDING, $first: Int = 50) {
    rawStakeholders(status: $status, first: $first) {
      id source rawName rawSektor hitCount targetCount lastSeen status confidence
      resolvedTo { id slug name }
      resolvedAt
      suggestions {
        confidence reason
        stakeholder { id slug name aliases sektor { slug name } }
      }
    }
  }
`;

const RAW_COUNTS = gql`
  query RawStakeholderCounts {
    rawStakeholderCounts { pending approved rejected needsReview }
  }
`;

const RESOLVE_RAW = gql`
  mutation ResolveRaw($rawId: ID!, $stakeholderId: ID!) {
    resolveRawStakeholder(rawId: $rawId, stakeholderId: $stakeholderId) {
      id status resolvedTo { slug name }
    }
  }
`;

const REJECT_RAW = gql`
  mutation RejectRaw($rawId: ID!, $reason: String) {
    rejectRawStakeholder(rawId: $rawId, reason: $reason) { id status }
  }
`;

const CREATE_FROM_RAW = gql`
  mutation CreateFromRaw($rawId: ID!, $input: StakeholderInput!) {
    createStakeholderFromRaw(rawId: $rawId, input: $input) {
      id status resolvedTo { id slug name }
    }
  }
`;

const RECOMPUTE = gql`
  mutation Recompute($rawId: ID) {
    recomputeSuggestions(rawId: $rawId)
  }
`;

const BULK_RESOLVE = gql`
  mutation BulkResolve($rawIds: [ID!]!, $stakeholderId: ID!) {
    bulkResolveRawStakeholders(rawIds: $rawIds, stakeholderId: $stakeholderId)
  }
`;

// ── Mutation result/var interfaces ────────────────────────────────────────────

interface ResolveResult {
  resolveRawStakeholder: { id: string; status: string; resolvedTo: { slug: string; name: string } | null };
}
interface ResolveVars { rawId: string; stakeholderId: string }

interface RejectResult {
  rejectRawStakeholder: { id: string; status: string };
}
interface RejectVars { rawId: string; reason?: string | null }

interface CreateFromRawResult {
  createStakeholderFromRaw: { id: string; status: string; resolvedTo: { id: string; slug: string; name: string } | null };
}
interface CreateFromRawVars { rawId: string; input: StakeholderInput }

interface RecomputeResult {
  recomputeSuggestions: number;
}
interface RecomputeVars { rawId?: string | null }

interface BulkResolveResult {
  bulkResolveRawStakeholders: number;
}
interface BulkResolveVars { rawIds: string[]; stakeholderId: string }

// ── Safe return shapes ────────────────────────────────────────────────────────

export interface MutationResult { ok: boolean; error: string | null }
export interface MutationCountResult { ok: boolean; error: string | null; count: number }

// ── Composable ────────────────────────────────────────────────────────────────

export function useReconciliationInbox(status: () => ReconciliationStatus): {
  raws: ComputedRef<RawStakeholder[]>;
  counts: ComputedRef<RawStakeholderCounts>;
  loading: Ref<boolean>;
  refetch: () => void;
  resolve: (rawId: string, stakeholderId: string) => Promise<MutationResult>;
  reject: (rawId: string, reason?: string) => Promise<MutationResult>;
  createFromRaw: (rawId: string, input: StakeholderInput) => Promise<MutationResult>;
  recompute: (rawId?: string) => Promise<MutationCountResult>;
  bulkResolve: (rawIds: string[], stakeholderId: string) => Promise<MutationCountResult>;
} {
  const listQ = useQuery<{ rawStakeholders: RawStakeholder[] }>(
    RAW_STAKEHOLDERS,
    () => ({ status: status(), first: 50 }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );

  const countsQ = useQuery<{ rawStakeholderCounts: RawStakeholderCounts }>(
    RAW_COUNTS,
    undefined,
    { fetchPolicy: 'cache-and-network' },
  );

  // All 5 useMutation calls with explicit generics — no `as` casts
  const resolveM  = useMutation<ResolveResult, ResolveVars>(RESOLVE_RAW);
  const rejectM   = useMutation<RejectResult, RejectVars>(REJECT_RAW);
  const createM   = useMutation<CreateFromRawResult, CreateFromRawVars>(CREATE_FROM_RAW);
  const recomputeM = useMutation<RecomputeResult, RecomputeVars>(RECOMPUTE);
  const bulkM     = useMutation<BulkResolveResult, BulkResolveVars>(BULK_RESOLVE);

  function refetchAll(): void {
    listQ.refetch();
    countsQ.refetch();
  }

  return {
    raws: computed(() => listQ.result.value?.rawStakeholders ?? []),
    counts: computed(() =>
      countsQ.result.value
        ? countsQ.result.value.rawStakeholderCounts
        : { pending: 0, approved: 0, rejected: 0, needsReview: 0 },
    ),
    loading: listQ.loading,
    refetch: refetchAll,

    resolve: async (rawId, stakeholderId): Promise<MutationResult> => {
      try {
        await resolveM.mutate({ rawId, stakeholderId });
        refetchAll();
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    reject: async (rawId, reason): Promise<MutationResult> => {
      try {
        await rejectM.mutate({ rawId, reason: reason ?? null });
        refetchAll();
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    createFromRaw: async (rawId, input): Promise<MutationResult> => {
      try {
        await createM.mutate({ rawId, input });
        refetchAll();
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    recompute: async (rawId): Promise<MutationCountResult> => {
      try {
        const r = await recomputeM.mutate({ rawId: rawId ?? null });
        refetchAll();
        return { ok: true, error: null, count: r?.data?.recomputeSuggestions ?? 0 };
      } catch (e) {
        return { ok: false, error: (e as Error).message, count: 0 };
      }
    },

    bulkResolve: async (rawIds, stakeholderId): Promise<MutationCountResult> => {
      try {
        const r = await bulkM.mutate({ rawIds, stakeholderId });
        refetchAll();
        return { ok: true, error: null, count: r?.data?.bulkResolveRawStakeholders ?? 0 };
      } catch (e) {
        return { ok: false, error: (e as Error).message, count: 0 };
      }
    },
  };
}
