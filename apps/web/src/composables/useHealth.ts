import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const HEALTH_QUERY = gql`
  query Health {
    health {
      api
      db
      serverTime
    }
  }
`;

interface HealthStatus {
  api: boolean;
  db: boolean;
  serverTime: string;
}

export function useHealth() {
  const { result, loading, error } = useQuery<{ health: HealthStatus }>(
    HEALTH_QUERY,
    null,
    { pollInterval: 10_000, fetchPolicy: 'no-cache' },
  );
  const health = computed(() => result.value?.health ?? null);
  return { health, loading, error };
}
