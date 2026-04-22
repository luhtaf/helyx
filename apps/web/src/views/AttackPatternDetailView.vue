<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useAttackPatternDetail } from '@/composables/useAttackPatterns';
import SectionRule from '@/components/ui/SectionRule.vue';
import EntityGraph, { type GraphEdge, type GraphNode } from '@/components/graph/EntityGraph.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import { phaseTier, tierColor, tierLabel } from '@/utils/killChain';
import { inkDimHex, signalHex } from '@/utils/severity';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');

const { ap, loading, error } = useAttackPatternDetail(() => idRef.value);

const detectionsBySource = computed(() => {
  const groups = new Map<string, { id: string; name: string; description: string | null; dataSourceName: string }[]>();
  for (const detection of ap.value?.detections ?? []) {
    const items = groups.get(detection.dataSourceName);
    if (items) {
      items.push(detection);
    } else {
      groups.set(detection.dataSourceName, [detection]);
    }
  }
  return Array.from(groups.entries()).map(([dataSourceName, items]) => ({ dataSourceName, items }));
});

const graph = computed<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
  const pattern = ap.value;
  if (!pattern) return { nodes: [], edges: [] };

  const center = `ttp:${pattern.id}`;
  const nodes: GraphNode[] = [
    {
      id: center,
      label: pattern.id,
      type: 'TTP',
      color: signalHex(),
      isCenter: true,
    },
  ];
  const edges: GraphEdge[] = [];

  for (const actor of pattern.threatActors) {
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
  (ap.value?.threatActors.length ?? 0) <= 8 ? 'concentric' : 'cose',
);
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'matrix', to: '/techniques' },
          { label: id, mono: true },
        ]"
        class="mb-3"
      />

      <div v-if="ap" class="flex flex-wrap items-baseline justify-between gap-4">
        <div class="flex flex-wrap items-baseline gap-4">
          <span class="font-mono text-[14px] text-ink-dim tabular-nums">{{ ap.id }}</span>
          <h1 class="text-[26px] font-medium tracking-tight text-ink">{{ ap.name }}</h1>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <span
            v-for="phase in ap.killChainPhases"
            :key="phase"
            class="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim"
          >
            <span class="inline-block h-2 w-2 rounded-full" :style="{ background: tierColor(phaseTier([phase])) }" />
            {{ tierLabel(phaseTier([phase])) }}
          </span>
        </div>
      </div>
    </header>

    <p v-if="loading && !ap" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!ap" class="text-[13px] text-ink-dim">
      technique not found in MITRE corpus.
    </p>

    <template v-else>
      <p v-if="ap.description" class="text-[13px] leading-6 text-ink-dim max-w-[68ch] whitespace-pre-line">
        {{ ap.description }}
      </p>

      <SectionRule label="identity">
        <template #right v-if="ap.url">
          <a :href="ap.url" target="_blank" rel="noopener noreferrer" class="hover:text-ink transition">
            mitre source ↗
          </a>
        </template>
      </SectionRule>

      <dl class="grid grid-cols-[140px_1fr] gap-y-2 font-mono text-[11px]">
        <dt class="text-ink-faint uppercase tracking-wider">platforms</dt>
        <dd class="text-ink-dim">{{ ap.platforms.length ? ap.platforms.join(', ') : '—' }}</dd>

        <dt class="text-ink-faint uppercase tracking-wider">kill-chain-phases</dt>
        <dd class="flex flex-wrap gap-x-4 gap-y-1 text-ink-dim">
          <span
            v-for="phase in ap.killChainPhases"
            :key="phase"
            class="inline-flex items-center gap-2"
          >
            <span class="inline-block h-2 w-2 rounded-full" :style="{ background: tierColor(phaseTier([phase])) }" />
            <span>{{ tierLabel(phaseTier([phase])) }}</span>
          </span>
          <span v-if="!ap.killChainPhases.length">—</span>
        </dd>

        <dt class="text-ink-faint uppercase tracking-wider">subtechnique</dt>
        <dd class="text-ink-dim">{{ ap.isSubtechnique ? 'yes' : 'no' }}</dd>
      </dl>

      <SectionRule label="detection">
        <template #right v-if="ap.detections.length">{{ ap.detections.length }} component{{ ap.detections.length === 1 ? '' : 's' }}</template>
      </SectionRule>

      <div v-if="detectionsBySource.length" class="space-y-6">
        <div v-for="group in detectionsBySource" :key="group.dataSourceName">
          <h3 class="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            {{ group.dataSourceName }}
          </h3>
          <ul class="space-y-2">
            <li
              v-for="detection in group.items"
              :key="detection.id"
              class="border-l-2 border-rule-strong pl-4 py-2"
            >
              <p class="font-mono text-[12px] text-ink">{{ detection.name }}</p>
              <p v-if="detection.description" class="mt-1 max-w-[68ch] text-[12px] leading-6 text-ink-dim">
                {{ detection.description }}
              </p>
            </li>
          </ul>
        </div>
      </div>
      <p v-else-if="ap.detection" class="text-[13px] leading-6 text-ink-dim max-w-[68ch] whitespace-pre-line">
        {{ ap.detection }}
      </p>
      <p v-else class="text-[12px] text-ink-faint">no detection guidance recorded.</p>

      <SectionRule label="threat actors using this">
        <template #right>{{ ap.threatActors.length }}</template>
      </SectionRule>

      <ul v-if="ap.threatActors.length" class="space-y-0">
        <li
          v-for="actor in ap.threatActors"
          :key="actor.id"
          class="border-l-2 border-rule-strong pl-4 py-3 hover:border-ink-dim transition-colors"
        >
          <RouterLink :to="`/threat-actors/${actor.id}`" class="block group">
            <div class="flex items-baseline justify-between gap-4">
              <div class="min-w-0">
                <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint tabular-nums">
                  {{ actor.id }}
                </p>
                <p class="text-[13px] text-ink group-hover:text-signal transition truncate">
                  {{ actor.name }}
                </p>
              </div>
              <span class="font-mono text-[11px] text-ink-dim tabular-nums shrink-0">
                {{ actor.techniqueCount }}
              </span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no linked threat actors recorded.</p>

      <SectionRule label="graph">
        <template #right>{{ ap.threatActors.length }}</template>
      </SectionRule>

      <p class="mb-3 font-mono text-[10px] text-ink-faint">
        click any neighbour node to navigate · scroll to zoom · drag to pan
      </p>

      <EntityGraph
        :nodes="graph.nodes"
        :edges="graph.edges"
        :layout="graphLayout"
        height="460px"
      />
    </template>
  </div>
</template>
