// apps/web/src/composables/useStakeholder.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';

const STAKEHOLDER = gql`
  query Stakeholder($id: ID!) {
    stakeholder(id: $id) {
      id slug name aliases city coords notes status
      createdAt updatedAt
      sektor { id slug name displayOrder stakeholderCount }
      sensor { stack status agentCount deployedAt notes }
    }
  }
`;

export function useStakeholder(id: () => string): {
  stakeholder: ComputedRef<Stakeholder | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ stakeholder: Stakeholder | null }>(
    STAKEHOLDER,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    stakeholder: computed(() => result.value?.stakeholder ?? null),
    loading,
    error,
  };
}
