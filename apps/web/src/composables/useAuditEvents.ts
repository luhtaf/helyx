// Append-only audit log reader. Tenant-scoped, newest-first. Supports
// action / actorUserId / targetType / since / until filters.
//
// Used by /admin/audit view (operator accountability surface, ANALYST+).

import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const AUDIT_EVENTS = gql`
  query AuditEvents($filter: AuditEventFilter, $page: Int, $perPage: Int) {
    auditEvents(filter: $filter, page: $page, perPage: $perPage) {
      total page perPage
      items {
        id
        actorUserId actorEmail actorDisplayName
        action targetType targetId
        ts before after
      }
    }
  }
`;

const AUDIT_ACTIONS = gql`
  query AuditActions { auditActions }
`;

export interface AuditEvent {
  id: string;
  actorUserId: string;
  actorEmail: string | null;
  actorDisplayName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  ts: string;
  /** JSON-stringified snapshot or null. */
  before: string | null;
  after: string | null;
}

export interface AuditEventPage {
  total: number;
  page: number;
  perPage: number;
  items: AuditEvent[];
}

export interface AuditEventFilter {
  action?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  since?: string | null;
  until?: string | null;
}

export function useAuditEvents(opts: {
  filter: () => AuditEventFilter;
  page: () => number;
  perPage: () => number;
}): {
  data: ComputedRef<AuditEventPage | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ auditEvents: AuditEventPage }>(
    AUDIT_EVENTS,
    () => ({
      filter: opts.filter(),
      page: opts.page(),
      perPage: opts.perPage(),
    }),
    () => ({ fetchPolicy: 'cache-and-network' as const }),
  );
  return {
    data: computed(() => result.value?.auditEvents ?? null),
    loading, error,
  };
}

export function useAuditActions(): { actions: ComputedRef<string[]>; loading: Ref<boolean> } {
  const { result, loading } = useQuery<{ auditActions: string[] }>(
    AUDIT_ACTIONS,
    undefined,
    () => ({ fetchPolicy: 'cache-first' as const }),
  );
  return {
    actions: computed(() => result.value?.auditActions ?? []),
    loading,
  };
}
