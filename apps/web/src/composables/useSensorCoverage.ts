// Cross-stakeholder sensor coverage. Reuses the existing `stakeholders`
// query (sensor field already there), filters client-side. Total per-org
// is ~200 stakeholders post-spiderfoot ingest, well under the size where
// server-side filter would matter.

import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';

const SENSOR_COVERAGE = gql`
  query SensorCoverage($first: Int = 500) {
    stakeholders(first: $first) {
      id slug name aliases city coords status
      sektor { id slug name }
      sensor { stack status agentCount deployedAt }
    }
  }
`;

export { type SensorStatusFilter, type SensorStackFilter } from './stakeholder-kinds';
import type { SensorStatusFilter, SensorStackFilter } from './stakeholder-kinds';

export interface SensorCounts {
  total: number;
  withSensor: number;
  online: number;
  degraded: number;
  offline: number;
  noSensor: number;
  byStack: Record<string, number>;
}

export function useSensorCoverage(filter: () => { status: SensorStatusFilter; stack: SensorStackFilter; search: string }): {
  stakeholders: ComputedRef<Stakeholder[]>;
  counts: ComputedRef<SensorCounts>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ stakeholders: Stakeholder[] }>(
    SENSOR_COVERAGE,
    () => ({ first: 500 }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );

  const all = computed(() => result.value?.stakeholders ?? []);

  const counts = computed<SensorCounts>(() => {
    const c: SensorCounts = {
      total: all.value.length,
      withSensor: 0,
      online: 0,
      degraded: 0,
      offline: 0,
      noSensor: 0,
      byStack: {},
    };
    for (const s of all.value) {
      const st = s.sensor.status;
      const stack = s.sensor.stack;
      if (st) {
        c.withSensor++;
        if (st === 'ONLINE') c.online++;
        else if (st === 'DEGRADED') c.degraded++;
        else if (st === 'OFFLINE') c.offline++;
      } else {
        c.noSensor++;
      }
      if (stack) {
        c.byStack[stack] = (c.byStack[stack] ?? 0) + 1;
      }
    }
    return c;
  });

  const stakeholders = computed(() => {
    const f = filter();
    const needle = f.search.toLowerCase().trim();
    return all.value.filter((s) => {
      // Status filter
      if (f.status !== 'ALL') {
        const sensorStatus = s.sensor.status;
        if (f.status === 'NO_SENSOR' && sensorStatus !== null) return false;
        if (f.status !== 'NO_SENSOR' && sensorStatus !== f.status) return false;
      }
      // Stack filter
      if (f.stack !== 'ALL') {
        const stack = s.sensor.stack;
        if (f.stack === 'NONE' && stack !== null) return false;
        if (f.stack !== 'NONE' && stack !== f.stack) return false;
      }
      // Search
      if (needle && !s.name.toLowerCase().includes(needle) && !s.slug.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  });

  return { stakeholders, counts, loading, error };
}
