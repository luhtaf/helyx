// Single-flight per (transform-id, parent-id) so the same expand on the
// same node can't fire twice in flight. Surfaces 0-result and error toasts.
//
// fetchPolicy:'cache-first' — repeated transforms hit Apollo cache, makes
// "expand → undo (hide) → expand again" feel instant.

import { provideApolloClient, useApolloClient } from '@vue/apollo-composable';
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client/core';
import { useToast } from './useToast';
import type { ExpandResult, GraphNode, Transform } from '@/components/graph/graph-types';

interface InflightEntry {
  promise: Promise<ExpandResult>;
}

export function useGraphTransform(): {
  run: (transform: Transform, parent: GraphNode, limit?: number) => Promise<ExpandResult>;
} {
  const { client } = useApolloClient();
  const { show } = useToast();
  const inflight = new Map<string, InflightEntry>();

  async function run(transform: Transform, parent: GraphNode, limit?: number): Promise<ExpandResult> {
    // Include limit in the inflight key so picking different sizes back-
    // to-back doesn't coalesce into one fetch.
    const flightKey = `${transform.id}|${parent.id}|${limit ?? 'default'}`;
    const existing = inflight.get(flightKey);
    if (existing) return existing.promise;

    const promise = (async (): Promise<ExpandResult> => {
      try {
        // Use the typed apollo client passed via provideApolloClient in main.ts.
        // Note: use as ApolloClient to satisfy generic constraint; inner types
        // are validated by each transform's expand fn.
        const apollo = client as ApolloClient<NormalizedCacheObject>;
        const r = await apollo.query({
          query: transform.query,
          variables: { id: parent.entityId, limit },
          fetchPolicy: 'cache-first',
        });
        const result = transform.expand(r.data, parent, limit);

        if (result.nodes.length === 0 && result.edges.length === 0) {
          show(`No results for "${transform.label}"`, 'info');
        } else if (result.totalAvailable && result.totalAvailable > result.nodes.length) {
          show(
            `Showing ${result.nodes.length} of ${result.totalAvailable} — refine to see more`,
            'info',
          );
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'transform failed';
        show(`${transform.label}: ${msg}`, 'error');
        return { nodes: [], edges: [] };
      } finally {
        // Hold the inflight key briefly so back-to-back identical clicks
        // coalesce, then release so a future click works.
        setTimeout(() => inflight.delete(flightKey), 250);
      }
    })();

    inflight.set(flightKey, { promise });
    return promise;
  }

  return { run };
}

// Re-export for tests/sanity — not strictly required at runtime.
export { provideApolloClient };
