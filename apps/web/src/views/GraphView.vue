<script setup lang="ts">
// /graph?seed=<type>:<id> — Maltego-style explorer.
//
// Phase G1 entry point. Composes HelyxGraph + ContextMenu + NodeDetailDrawer
// and wires transforms.ts via useGraphTransform. Empty/404/forbidden states
// per autoplan review (M1, M2, H3).

import { ref, computed, watch, onMounted, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import HelyxGraph from '@/components/graph/HelyxGraph.vue';
import ContextMenu from '@/components/graph/ContextMenu.vue';
import NodeDetailDrawer from '@/components/graph/NodeDetailDrawer.vue';
import { transformsFor } from '@/components/graph/transforms';
import { nodeId, type GraphNode, type Transform } from '@/components/graph/graph-types';
import { useGraphTransform } from '@/composables/useGraphTransform';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import Button from '@/components/ui/Button.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { show: showToast } = useToast();
const { run: runTransform } = useGraphTransform();

// ─── Seed parsing ──────────────────────────────────────────────────
interface ParsedSeed { type: GraphNode['type']; id: string }
function parseSeed(raw: string | null | undefined): ParsedSeed | null {
  if (!raw) return null;
  const [t, id] = String(raw).split(':');
  if (!t || !id) return null;
  const type = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() as GraphNode['type'];
  if (!['Stakeholder', 'Asset', 'CVE', 'Case', 'Sektor', 'CWE'].includes(type)) return null;
  return { type, id };
}

const seed = computed<ParsedSeed | null>(() => parseSeed(route.query.seed as string | undefined));

// ─── Seed entity fetch (so we can render label) ─────────────────────
const SEED_STAKEHOLDER = gql`query SeedStakeholder($id: ID!) { stakeholder(id: $id) { id slug name } }`;
const SEED_ASSET       = gql`query SeedAsset($id: ID!) { asset(id: $id) { id name kind hostname } }`;
const SEED_CVE         = gql`query SeedCve($id: ID!) { cve(id: $id) { id description cvssV31BaseSeverity cvssV31BaseScore } }`;
const SEED_CASE        = gql`query SeedCase($id: ID!) { case(id: $id) { id reportNo title status } }`;

const seedQuery = computed(() => {
  if (!seed.value) return null;
  switch (seed.value.type) {
    case 'Stakeholder': return SEED_STAKEHOLDER;
    case 'Asset': return SEED_ASSET;
    case 'CVE': return SEED_CVE;
    case 'Case': return SEED_CASE;
    default: return null;
  }
});

const { result: seedResult, loading: seedLoading, error: seedError } = useQuery(
  () => seedQuery.value!,
  () => ({ id: seed.value?.id ?? '' }),
  () => ({ enabled: Boolean(seed.value && seedQuery.value), fetchPolicy: 'cache-and-network' as const }),
);

const seedNode = computed<GraphNode | null>(() => {
  if (!seed.value || !seedResult.value) return null;
  const r = seedResult.value as Record<string, unknown>;
  switch (seed.value.type) {
    case 'Stakeholder': {
      const s = r.stakeholder as { id: string; slug: string; name: string } | null;
      return s ? { id: nodeId('Stakeholder', s.id), entityId: s.id, type: 'Stakeholder', label: s.name, data: { slug: s.slug } } : null;
    }
    case 'Asset': {
      const a = r.asset as { id: string; name: string; kind: string; hostname: string | null } | null;
      return a ? { id: nodeId('Asset', a.id), entityId: a.id, type: 'Asset', label: a.name, data: { kind: a.kind, hostname: a.hostname } } : null;
    }
    case 'CVE': {
      const c = r.cve as { id: string; description: string | null; cvssV31BaseSeverity: string | null; cvssV31BaseScore: number | null } | null;
      return c ? { id: nodeId('CVE', c.id), entityId: c.id, type: 'CVE', label: c.id, data: { severity: c.cvssV31BaseSeverity ?? 'NONE', baseScore: c.cvssV31BaseScore, description: c.description } } : null;
    }
    case 'Case': {
      const c = r.case as { id: string; reportNo: string; title: string | null; status: string } | null;
      return c ? { id: nodeId('Case', c.id), entityId: c.id, type: 'Case', label: c.reportNo, data: { title: c.title, status: c.status } } : null;
    }
    default: return null;
  }
});

// ─── Graph state ───────────────────────────────────────────────────
const graphRef = useTemplateRef<InstanceType<typeof HelyxGraph>>('graphRef');
const ctxMenu = ref<{ node: GraphNode; x: number; y: number } | null>(null);
const selected = ref<GraphNode | null>(null);
const ctxTransforms = computed<Transform[]>(() => ctxMenu.value ? transformsFor(ctxMenu.value.node.type) : []);

// Push the seed node into the graph once both seed + cy are ready.
let seeded = false;
async function plantSeed(): Promise<void> {
  if (seeded || !seedNode.value || !graphRef.value) return;
  await graphRef.value.addNodes([seedNode.value], []);
  seeded = true;
}
watch([seedNode, graphRef], plantSeed, { immediate: true });

// 404 / permission path
watch(seedError, (err) => {
  if (err) showToast(`Seed not loaded: ${err.message}`, 'error');
});
watch([seedLoading, seedNode, seed], ([loading, node, s]) => {
  if (!loading && s && !node && !seedError.value) {
    showToast('Entity not found or no access in this org', 'error');
  }
});

// ─── Tenant switch reset (G1.9a) ──────────────────────────────────
// activeOrgId change → graph cleared + drawer closed. URL param stays;
// next tenant either has the entity (re-seed) or 404s (toast above).
watch(() => auth.activeOrgId, () => {
  if (graphRef.value) graphRef.value.clearGraph();
  selected.value = null;
  seeded = false;
  // Re-plant if seedNode resolves under new tenant
  setTimeout(plantSeed, 100);
});

// ─── Transform pick ────────────────────────────────────────────────
async function onPick(transform: Transform): Promise<void> {
  if (!ctxMenu.value || !graphRef.value) return;
  const parent = ctxMenu.value.node;
  const result = await runTransform(transform, parent);
  if (result.nodes.length > 0 || result.edges.length > 0) {
    await graphRef.value.addNodes(result.nodes, result.edges);
  }
}

function onCapReached(payload: { current: number; cap: number }): void {
  showToast(`Cap reached (${payload.current}/${payload.cap}) — hide nodes to add more`, 'info');
}

function onHide(): void {
  if (!ctxMenu.value || !graphRef.value) return;
  graphRef.value.removeNode(ctxMenu.value.node.id);
  selected.value = null;
}

// ─── Empty state — last 5 stakeholders for quick-pick ──────────────
const RECENT_STAKEHOLDERS = gql`
  query GraphRecentStakeholders {
    stakeholders(first: 5) { id name slug }
  }
`;
const { result: recentResult } = useQuery<{ stakeholders: { id: string; name: string; slug: string }[] }>(
  RECENT_STAKEHOLDERS,
  undefined,
  () => ({ enabled: !seed.value, fetchPolicy: 'cache-first' as const }),
);
const recentStakeholders = computed(() => recentResult.value?.stakeholders ?? []);

function pickRecent(s: { id: string }): void {
  router.replace({ query: { seed: `stakeholder:${s.id}` } });
}

onMounted(() => { void plantSeed(); });
</script>

<template>
  <div class="fixed inset-0 top-0 left-[180px] right-0 bottom-0 z-10">
    <!-- Empty state when no seed -->
    <div v-if="!seed" class="h-full flex flex-col items-center justify-center px-12 text-center">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-3">graph explorer</p>
      <h1 class="text-[22px] font-medium text-ink mb-2">Pick a seed entity</h1>
      <p class="text-[13px] text-ink-dim max-w-[40ch] mb-8">
        Open any stakeholder, asset, CVE, or case in graph mode to start exploring relationships.
        Right-click any node to enrich it (Maltego-style transforms).
      </p>
      <div v-if="recentStakeholders.length" class="space-y-1 w-full max-w-[360px]">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 text-left">recent stakeholders</p>
        <button
          v-for="s in recentStakeholders"
          :key="s.id"
          type="button"
          class="block w-full text-left px-3 py-2 border border-rule-strong rounded-md hover:bg-surface transition text-[13px] text-ink"
          @click="pickRecent(s)"
        >
          <span class="font-mono text-[11px] text-ink-faint">{{ s.slug }}</span>
          <span class="ml-2">{{ s.name }}</span>
        </button>
      </div>
    </div>

    <!-- Graph with seed -->
    <template v-else>
      <header class="absolute top-4 left-4 right-4 z-20 flex items-baseline justify-between gap-4 pointer-events-none">
        <div class="bg-base/80 backdrop-blur-sm border border-rule-strong rounded-md px-3 py-1.5 pointer-events-auto">
          <p class="font-mono text-[9px] uppercase tracking-wider text-ink-faint">seed</p>
          <p class="font-mono text-[12px] text-ink mt-0.5">{{ seedNode?.label ?? seed.id }}</p>
        </div>
        <Button variant="ghost" class="pointer-events-auto" @click="graphRef?.relayoutAll()">Re-layout</Button>
      </header>

      <p
        v-if="seedLoading && !seedNode"
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] text-ink-dim"
      >loading seed…</p>

      <HelyxGraph
        ref="graphRef"
        :seed-id="seed.id"
        :cap="200"
        @context-menu="(p) => (ctxMenu = p)"
        @node-selected="(n) => (selected = n)"
        @cap-reached="onCapReached"
      />

      <ContextMenu
        v-if="ctxMenu"
        :x="ctxMenu.x"
        :y="ctxMenu.y"
        :node="ctxMenu.node"
        :transforms="ctxTransforms"
        @pick="onPick"
        @hide="onHide"
        @close="ctxMenu = null"
      />

      <NodeDetailDrawer :node="selected" @close="selected = null" />
    </template>
  </div>
</template>
