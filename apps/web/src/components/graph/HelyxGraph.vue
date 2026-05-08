<script setup lang="ts">
// Thin component shell around useCytoscape. Wires up cy events to Vue
// emits so parent (GraphView) handles context-menu + node-select via
// regular component event flow. No business logic here — that's all
// in transforms.ts + useGraphTransform.

import { ref, watch } from 'vue';
import type { ElementDefinition, EventObject } from 'cytoscape';
import { useCytoscape } from '@/composables/useCytoscape';
import type { GraphNode, GraphEdge } from './graph-types';

const props = defineProps<{
  /** Used as the seed key for re-init on change. */
  seedId: string | null;
  /** Hard cap. When totalNodes >= cap, addElements no-ops. */
  cap?: number;
}>();

const emit = defineEmits<{
  (e: 'context-menu', payload: { node: GraphNode; x: number; y: number }): void;
  (e: 'node-selected', node: GraphNode | null): void;
  (e: 'cap-reached', payload: { current: number; cap: number }): void;
  (e: 'ready'): void;
}>();

const { containerRef, cy, addElements: addCyElements, relayoutAll, clear } = useCytoscape(
  () => props.seedId,
);

const totalNodes = ref(0);

// ─── public API exposed via defineExpose so parent imperative-calls work ───
async function addNodes(nodes: GraphNode[], edges: GraphEdge[]): Promise<void> {
  if (!cy.value) return;
  const cap = props.cap ?? 200;
  const incoming = nodes.filter((n) => !cy.value!.getElementById(n.id).length).length;
  if (totalNodes.value + incoming > cap) {
    emit('cap-reached', { current: totalNodes.value, cap });
    return;
  }

  const defs: ElementDefinition[] = [
    ...nodes.map((n) => ({
      group: 'nodes' as const,
      data: {
        id: n.id,
        type: n.type,
        label: n.label,
        entityId: n.entityId,
        ...(n.data ?? {}),
      },
    })),
    ...edges.map((e) => ({
      group: 'edges' as const,
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        edgeType: e.edgeType,
        label: e.label ?? '',
      },
    })),
  ];
  await addCyElements(defs);
  totalNodes.value = cy.value.nodes().length;
}

function clearGraph(): void {
  clear();
  totalNodes.value = 0;
}

function removeNode(nodeIdToRemove: string): void {
  if (!cy.value) return;
  cy.value.getElementById(nodeIdToRemove).remove();
  totalNodes.value = cy.value.nodes().length;
}

// Snapshot the current graph state for save-as-hunt: nodes (id, type, label,
// data, position), edges (id, source, target, edgeType, label), viewport.
// Position preserved so re-load doesn't relayout — user-pinned positions
// survive.
interface SnapshotShape {
  nodes: Array<{ id: string; type: string; label: string; entityId: string; data: Record<string, unknown>; position: { x: number; y: number }; locked: boolean }>;
  edges: Array<{ id: string; source: string; target: string; edgeType: string; label: string }>;
  viewport: { zoom: number; pan: { x: number; y: number } };
}
function getSnapshot(): SnapshotShape {
  if (!cy.value) return { nodes: [], edges: [], viewport: { zoom: 1, pan: { x: 0, y: 0 } } };
  const cy_ = cy.value;
  const nodes = cy_.nodes().map((n) => {
    const d = n.data() as { id: string; type: string; label: string; entityId: string };
    return {
      id: d.id,
      type: d.type,
      label: d.label,
      entityId: d.entityId,
      data: { ...n.data() },
      position: { ...n.position() },
      locked: n.locked(),
    };
  });
  const edges = cy_.edges().map((e) => {
    const d = e.data() as { id: string; source: string; target: string; edgeType: string; label?: string };
    return { id: d.id, source: d.source, target: d.target, edgeType: d.edgeType, label: d.label ?? '' };
  });
  return {
    nodes,
    edges,
    viewport: { zoom: cy_.zoom(), pan: { ...cy_.pan() } },
  };
}

// Inverse of getSnapshot: clear the graph and reconstruct from saved JSON.
// Skips layout (positions are explicit). Locks nodes that were previously
// locked. Restores viewport.
function loadSnapshot(snap: SnapshotShape): void {
  if (!cy.value) return;
  const cy_ = cy.value;
  cy_.elements().remove();
  for (const n of snap.nodes) {
    const added = cy_.add({
      group: 'nodes',
      data: n.data,
      position: n.position,
    });
    if (n.locked) added.lock();
  }
  for (const e of snap.edges) {
    cy_.add({
      group: 'edges',
      data: { id: e.id, source: e.source, target: e.target, edgeType: e.edgeType, label: e.label },
    });
  }
  cy_.zoom(snap.viewport.zoom);
  cy_.pan(snap.viewport.pan);
  totalNodes.value = cy_.nodes().length;
}

defineExpose({ addNodes, clearGraph, relayoutAll, removeNode, getNodeCount: () => totalNodes.value, getSnapshot, loadSnapshot });

// ─── event wiring (after cy is mounted) ───
watch(cy, (instance) => {
  if (!instance) return;

  instance.on('cxttap', 'node', (evt: EventObject) => {
    const node = evt.target;
    const data = node.data() as { id: string; type: GraphNode['type']; label: string; entityId: string };
    const rendered = node.renderedPosition();
    const containerRect = containerRef.value?.getBoundingClientRect();
    emit('context-menu', {
      node: { id: data.id, type: data.type, label: data.label, entityId: data.entityId },
      // Translate cy renderedPosition (relative to container) → page coords
      x: (containerRect?.left ?? 0) + rendered.x,
      y: (containerRect?.top ?? 0) + rendered.y,
    });
  });

  instance.on('tap', 'node', (evt: EventObject) => {
    const data = evt.target.data() as { id: string; type: GraphNode['type']; label: string; entityId: string };
    emit('node-selected', { id: data.id, type: data.type, label: data.label, entityId: data.entityId });
  });

  // Click empty canvas → deselect drawer
  instance.on('tap', (evt: EventObject) => {
    if (evt.target === instance) emit('node-selected', null);
  });

  // Double-click → toggle pin (lock/unlock position)
  instance.on('dbltap', 'node', (evt: EventObject) => {
    const node = evt.target;
    if (node.locked()) node.unlock();
    else node.lock();
  });

  emit('ready');
});
</script>

<template>
  <div
    ref="containerRef"
    class="w-full h-full bg-base"
    @contextmenu.prevent
  />
</template>
