<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import cytoscape, { type Core, type LayoutOptions } from 'cytoscape';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color?: string;
  routeTo?: string;
  isCenter?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

const props = withDefaults(
  defineProps<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    layout?: 'concentric' | 'cose' | 'breadthfirst' | 'circle';
    height?: string;
  }>(),
  { layout: 'concentric', height: '380px' },
);

const container = ref<HTMLDivElement>();
const router = useRouter();
let cy: Core | null = null;

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function buildLayout(name: string): LayoutOptions {
  if (name === 'concentric') {
    return {
      name: 'concentric',
      concentric: (n) => (n.data('isCenter') ? 100 : 1),
      levelWidth: () => 1,
      spacingFactor: 1.6,
      minNodeSpacing: 30,
      animate: false,
      padding: 30,
    } as LayoutOptions;
  }
  if (name === 'cose') {
    return {
      name: 'cose',
      animate: false,
      padding: 30,
      nodeRepulsion: () => 6000,
      idealEdgeLength: () => 90,
      gravity: 0.3,
    } as LayoutOptions;
  }
  return { name, padding: 30, animate: false } as LayoutOptions;
}

function build(): void {
  if (!container.value) return;
  cy?.destroy();

  const ink = readVar('--ink');
  const inkDim = readVar('--ink-dim');
  const inkFaint = readVar('--ink-faint');
  const rule = readVar('--rule-strong');
  const signal = readVar('--signal');
  const fallback = readVar('--ink-dim');

  const elements = [
    ...props.nodes.map((n) => ({
      group: 'nodes' as const,
      data: { ...n, color: n.color ?? fallback },
      classes: n.isCenter ? 'is-center' : '',
    })),
    ...props.edges.map((e) => ({
      group: 'edges' as const,
      data: { source: e.source, target: e.target, label: e.label ?? '' },
    })),
  ];

  cy = cytoscape({
    container: container.value,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)' as unknown as string,
          'border-width': 0,
          label: 'data(label)' as unknown as string,
          color: inkDim,
          'font-family': '"JetBrains Mono", ui-monospace, monospace',
          'font-size': 10,
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'text-max-width': '180' as unknown as string,
          'text-wrap': 'ellipsis',
          width: 12,
          height: 12,
          'min-zoomed-font-size': 6,
        },
      },
      {
        selector: 'node.is-center',
        style: {
          width: 22,
          height: 22,
          'border-width': 1.5,
          'border-color': signal,
          color: ink,
          'font-size': 12,
          'font-weight': 600,
        },
      },
      {
        selector: 'node[?routeTo]',
        style: { 'overlay-padding': 6, 'overlay-opacity': 0 },
      },
      {
        selector: 'node[?routeTo]:active',
        style: { 'overlay-color': signal, 'overlay-opacity': 0.15 },
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': rule,
          'curve-style': 'straight',
          'target-arrow-shape': 'none',
          opacity: 0.7,
          label: 'data(label)' as unknown as string,
          'font-family': '"JetBrains Mono", ui-monospace, monospace',
          'font-size': 9,
          color: inkFaint,
          'text-rotation': 'autorotate',
          'text-margin-y': -6,
        },
      },
    ],
    layout: buildLayout(props.layout),
    minZoom: 0.4,
    maxZoom: 2.5,
    wheelSensitivity: 0.25,
    boxSelectionEnabled: false,
    autoungrabify: false,
    autounselectify: true,
  });

  cy.on('tap', 'node', (evt) => {
    const route = evt.target.data('routeTo');
    if (route) router.push(route);
  });

  cy.on('mouseover', 'node[?routeTo]', () => {
    if (container.value) container.value.style.cursor = 'pointer';
  });
  cy.on('mouseout', 'node', () => {
    if (container.value) container.value.style.cursor = '';
  });
}

onMounted(build);
onBeforeUnmount(() => {
  cy?.destroy();
  cy = null;
});

watch(
  () => [props.nodes, props.edges, props.layout],
  () => build(),
  { deep: true },
);
</script>

<template>
  <div
    ref="container"
    :style="{ height, width: '100%' }"
    class="border border-rule rounded-[1px] bg-base/30"
  />
</template>
