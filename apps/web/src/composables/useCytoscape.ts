// Cytoscape lifecycle + incremental layout helpers. See plan G1.3a.
//
// Why a composable:
//   - cy is imperative; Vue reactivity only manages the surrounding shell.
//   - Lifecycle (create on mount, destroy on unmount, destroy+reinit on
//     seed change) is easy to get wrong inside a component file. Centralizing
//     it kills two CRITICAL findings from the autoplan review (cy.destroy()
//     leak path + cose-bilkent partial-layout false claim).
//
// Why fcose:
//   - cose-bilkent has no documented incremental mode. fcose has
//     `randomize: false` + `quality: 'proof'` for steady incremental.
//   - We still lock untouched nodes around partial layout. Belt + braces.

import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import cytoscape, {
  type Core,
  type ElementDefinition,
  type NodeSingular,
} from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { HELYX_STYLESHEET } from '@/components/graph/cytoscape-styles';

// HMR-safe registration (reload may re-import this module; cytoscape extension
// register is idempotent in v3.30+ but explicit guard avoids noisy console).
declare global {
  interface Window { __helyx_fcose_registered?: boolean }
}
if (typeof window !== 'undefined' && !window.__helyx_fcose_registered) {
  cytoscape.use(fcose);
  window.__helyx_fcose_registered = true;
}

const FULL_LAYOUT_OPTS = {
  name: 'fcose',
  quality: 'proof' as const,
  animate: true,
  animationDuration: 350,
  animationEasing: 'ease-out' as const,
  randomize: true,
  fit: true,
  padding: 60,
  // Reasonable physics for ~100 nodes
  nodeRepulsion: 4500,
  idealEdgeLength: 100,
  edgeElasticity: 0.45,
  gravity: 0.25,
  numIter: 2500,
};

const INCREMENTAL_LAYOUT_OPTS = {
  ...FULL_LAYOUT_OPTS,
  randomize: false,
  fit: false,
  animate: 'end' as const,
  animationDuration: 250,
  numIter: 1000,
};

export interface UseCytoscapeReturn {
  containerRef: Ref<HTMLElement | null>;
  cy: Ref<Core | null>;
  /** Add nodes/edges + run incremental layout (existing nodes locked). */
  addElements: (defs: ElementDefinition[]) => Promise<void>;
  /** Force a full layout across everything. */
  relayoutAll: () => Promise<void>;
  /** Drop everything but keep cy alive (for tenant switch / seed change). */
  clear: () => void;
  /** Destroy cy + reinit blank. */
  reset: () => void;
}

/**
 * Mounts a cytoscape instance into containerRef.value, with explicit
 * lifecycle handling for: route param change (watch seed), unmount, and
 * destroy-on-error. Layout calls wrapped in idle scheduling so they don't
 * block input on slow boxes.
 */
export function useCytoscape(seedKey: () => string | null): UseCytoscapeReturn {
  const containerRef = ref<HTMLElement | null>(null);
  const cy = ref<Core | null>(null);

  function init(): void {
    if (!containerRef.value) return;
    teardown();
    cy.value = cytoscape({
      container: containerRef.value,
      elements: [],
      style: HELYX_STYLESHEET,
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
      // boxSelectionEnabled: false to avoid drag-rect interfering with right-click menu.
      boxSelectionEnabled: false,
      autoungrabify: false,
    });
  }

  function teardown(): void {
    if (!cy.value) return;
    cy.value.removeAllListeners();
    cy.value.destroy();
    cy.value = null;
  }

  /**
   * Run a layout via requestIdleCallback so the click → expand → layout
   * chain doesn't freeze input for 600-1000ms (subagent finding H5).
   * Falls back to setTimeout when rIC is unavailable (Safari, jsdom).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scheduleLayout(opts: any): Promise<void> {
    return new Promise((resolve) => {
      const run = (): void => {
        if (!cy.value) return resolve();
        const layout = cy.value.layout(opts);
        layout.one('layoutstop', () => resolve());
        layout.run();
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void })
          .requestIdleCallback(run, { timeout: 200 });
      } else {
        setTimeout(run, 0);
      }
    });
  }

  async function addElements(defs: ElementDefinition[]): Promise<void> {
    if (!cy.value || defs.length === 0) return;
    const existingNodeIds = new Set(cy.value.nodes().map((n: NodeSingular) => n.id()));
    const wasEmpty = existingNodeIds.size === 0;

    // cy.add is idempotent on duplicate id (returns existing element). New
    // ids = strict additions.
    const added = cy.value.add(defs);
    const newNodes = added.filter((el) => el.isNode() && !existingNodeIds.has(el.id()));

    if (wasEmpty && newNodes.length === 1) {
      // Seed-only render: fcose can't position a single node meaningfully,
      // and the default (0,0) sits at the top-left corner of the viewport.
      // Center the camera + give the node a reasonable resting position.
      const seed = newNodes[0];
      if (seed) {
        seed.position({ x: 0, y: 0 });
        cy.value.center();
      }
      return;
    }

    // Lock all pre-existing nodes around incremental layout so they don't
    // drift (autoplan finding C1 — fcose doesn't preserve positions of
    // unlocked nodes during force calc).
    const toLock = cy.value.nodes().filter((n: NodeSingular) => existingNodeIds.has(n.id()) && !n.locked());
    toLock.lock();
    try {
      if (newNodes.length > 0) {
        await scheduleLayout(wasEmpty ? FULL_LAYOUT_OPTS : INCREMENTAL_LAYOUT_OPTS);
        // Fit camera to include the freshly-added nodes — without this,
        // expanding from a tightly-laid-out hub places new nodes outside
        // the current viewport and the operator sees 'nothing happened'.
        // 50ms gives fcose a tick to settle final positions.
        if (cy.value) {
          const cyRef = cy.value;
          setTimeout(() => cyRef.animate({ fit: { eles: cyRef.elements(), padding: 60 }, duration: 250 }), 50);
        }
      }
    } finally {
      toLock.unlock();
    }
  }

  async function relayoutAll(): Promise<void> {
    await scheduleLayout(FULL_LAYOUT_OPTS);
  }

  function clear(): void {
    if (cy.value) cy.value.elements().remove();
  }

  function reset(): void {
    init();
  }

  // Initial mount: container is bound after first render. nextTick gives
  // Vue a tick to attach the ref before we read containerRef.value.
  onMounted(async () => {
    await nextTick();
    init();
  });

  // Re-init when the seed key changes (route param flips). Vue may reuse
  // the component, so we can't rely on unmount/remount.
  watch(seedKey, () => {
    if (cy.value) reset();
  });

  onBeforeUnmount(() => teardown());

  return { containerRef, cy, addElements, relayoutAll, clear, reset };
}
