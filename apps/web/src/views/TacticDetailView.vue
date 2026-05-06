<script setup lang="ts">
import { computed, toRef } from 'vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import EntityGraph, { type GraphEdge, type GraphNode } from '@/components/graph/EntityGraph.vue';
import SectionRule from '@/components/ui/SectionRule.vue';
import { useTacticDetail } from '@/composables/useTactics';
import { phaseTier, tierColor, tierLabel } from '@/utils/killChain';
import { inkDimHex, signalHex } from '@/utils/severity';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');

const { tactic, loading, error } = useTacticDetail(() => idRef.value);

const graph = computed<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
  const detail = tactic.value;
  if (!detail) return { nodes: [], edges: [] };

  const center = `tactic:${detail.id}`;
  const nodes: GraphNode[] = [
    { id: center, label: detail.name, type: 'TACTIC', color: signalHex(), isCenter: true },
  ];
  const edges: GraphEdge[] = [];

  for (const technique of detail.techniques.slice(0, 10)) {
    const id = `ttp:${technique.id}`;
    nodes.push({
      id,
      label: technique.id,
      type: 'TTP',
      color: tierColor(phaseTier(technique.killChainPhases)),
      routeTo: `/techniques/${technique.id}`,
    });
    edges.push({ source: center, target: id });
  }

  for (const actor of detail.topActors.slice(0, 8)) {
    const id = `ta:${actor.id}`;
    nodes.push({
      id,
      label: actor.name,
      type: 'TA',
      color: inkDimHex(),
      routeTo: `/threat-actors/${actor.id}`,
    });
    edges.push({ source: center, target: id, label: 'uses' });
  }

  return { nodes, edges };
});

const graphLayout = computed<'concentric' | 'cose'>(() =>
  graph.value.nodes.length > 12 ? 'cose' : 'concentric',
);
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'matrix', to: '/techniques' },
          { label: tactic?.name ?? id, mono: !tactic },
        ]"
        class="mb-3"
      />

      <div v-if="tactic" class="flex flex-wrap items-baseline justify-between gap-4">
        <div class="flex flex-wrap items-baseline gap-4">
          <span class="font-mono text-[14px] text-ink-dim tabular-nums">{{ tactic.id }}</span>
          <h1 class="text-[26px] font-medium tracking-tight text-ink">{{ tactic.name }}</h1>
        </div>
        <span class="font-mono text-[11px] tracking-wider text-ink-dim">
          step {{ tactic.ordering + 1 }} of 14
        </span>
      </div>
    </header>

    <p v-if="loading && !tactic" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!tactic" class="text-[13px] text-ink-dim">
      tactic not found in MITRE corpus.
    </p>

    <template v-else>
      <p v-if="tactic.description" class="text-[13px] leading-6 text-ink-dim max-w-[68ch] whitespace-pre-line">
        {{ tactic.description }}
      </p>

      <SectionRule label="techniques">
        <template #right>{{ tactic.techniqueCount }}</template>
      </SectionRule>

      <ul v-if="tactic.techniques.length" class="space-y-0">
        <li
          v-for="technique in tactic.techniques"
          :key="technique.id"
          class="border-l-2 border-rule-strong pl-4 py-3 hover:border-ink-dim transition"
        >
          <RouterLink :to="`/techniques/${technique.id}`" class="block group">
            <div class="flex items-baseline justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-baseline gap-3">
                  <span class="font-mono text-[12px] text-ink-dim tabular-nums">{{ technique.id }}</span>
                  <span class="text-[13px] text-ink group-hover:text-signal transition truncate">
                    {{ technique.name }}
                  </span>
                </div>
                <p class="mt-1 font-mono text-[10px] text-ink-faint">
                  {{ technique.platforms.length ? technique.platforms.join(', ') : '—' }}
                </p>
              </div>
              <span
                v-if="technique.isSubtechnique"
                class="font-mono text-[10px] text-ink-faint shrink-0"
              >
                subtech
              </span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no techniques recorded in this tactic.</p>

      <SectionRule label="actors active in this tactic">
        <template #right>{{ tactic.topActors.length }}</template>
      </SectionRule>

      <ul v-if="tactic.topActors.length" class="space-y-0">
        <li
          v-for="actor in tactic.topActors"
          :key="actor.id"
          class="border-l-2 border-rule-strong pl-4 py-3 hover:border-ink-dim transition"
        >
          <RouterLink :to="`/threat-actors/${actor.id}`" class="block group">
            <div class="flex items-baseline justify-between gap-4">
              <div class="flex items-baseline gap-3 min-w-0">
                <span class="font-mono text-[12px] text-ink-dim tabular-nums">{{ actor.id }}</span>
                <span class="text-[13px] text-ink group-hover:text-signal transition truncate">
                  {{ actor.name }}
                </span>
              </div>
              <span class="font-mono text-[10px] text-ink-faint shrink-0">
                uses {{ actor.techniquesInTacticCount }} of {{ actor.techniqueCount }} techniques
              </span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no actors mapped to this tactic.</p>

      <SectionRule label="graph">
        <template #right>{{ graph.nodes.length - 1 }}</template>
      </SectionRule>

      <p class="mb-3 font-mono text-[10px] text-ink-faint">
        click any neighbour node to navigate · scroll to zoom · drag to pan
      </p>

      <EntityGraph
        :nodes="graph.nodes"
        :edges="graph.edges"
        :layout="graphLayout"
        height="480px"
      />
    </template>
  </div>
</template>
