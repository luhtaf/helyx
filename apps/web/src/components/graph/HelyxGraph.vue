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

defineExpose({ addNodes, clearGraph, relayoutAll, removeNode, getNodeCount: () => totalNodes.value });

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
