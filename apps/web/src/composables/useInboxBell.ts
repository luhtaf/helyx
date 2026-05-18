// Combined review-queue counts for the top-right notification bell.
// Merges the two operator inboxes:
//   - stakeholder reconciliation  (ADMIN+) — rawStakeholderCounts.pending
//   - inventory inbox             (ANALYST+) — pending scan reports
// Role-gated per queue so a query never fires for a role the backend
// would reject. Light: counts only, no list payloads.

import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import { useAuthStore } from '@/stores/auth';

const RECON_PENDING = gql`
  query InboxReconPending {
    rawStakeholderCounts { pending }
  }
`;
const INVENTORY_PENDING = gql`
  query InboxInventoryPending {
    scanReports(filter: { status: pending }, limit: 50) { id }
  }
`;

export function useInboxBell() {
  const auth = useAuthStore();
  const canRecon = computed(() => auth.hasMinRole('ADMIN'));
  const canInventory = computed(() => auth.hasMinRole('ANALYST'));
  const visible = computed(() => canInventory.value); // ANALYST sees ≥1 queue

  const reconQ = useQuery<{ rawStakeholderCounts: { pending: number } }>(
    RECON_PENDING, null,
    () => ({ enabled: canRecon.value, fetchPolicy: 'cache-and-network' }),
  );
  const invQ = useQuery<{ scanReports: { id: string }[] }>(
    INVENTORY_PENDING, null,
    () => ({ enabled: canInventory.value, fetchPolicy: 'cache-and-network' }),
  );

  const reconPending = computed(() =>
    canRecon.value ? (reconQ.result.value?.rawStakeholderCounts?.pending ?? 0) : 0,
  );
  // Capped at the query limit (50) — badge shows "50+" upstream.
  const inventoryPending = computed(() =>
    canInventory.value ? (invQ.result.value?.scanReports?.length ?? 0) : 0,
  );
  const total = computed(() => reconPending.value + inventoryPending.value);

  function refetch(): void {
    if (canRecon.value) reconQ.refetch();
    if (canInventory.value) invQ.refetch();
  }

  return {
    visible, canRecon, canInventory,
    reconPending, inventoryPending, total,
    refetch,
  };
}
