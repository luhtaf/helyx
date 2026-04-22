<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useThreatActorDetail } from '@/composables/useThreatActors';
import SectionRule from '@/components/ui/SectionRule.vue';
import EntityGraph, { type GraphNode, type GraphEdge } from '@/components/graph/EntityGraph.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import { signalHex } from '@/utils/severity';
import { phaseTier, tierColor, tierLabel, type PhaseTier } from '@/utils/killChain';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');

const { ta, loading, error } = useThreatActorDetail(() => idRef.value);

function fmtDate(s: string | null | undefined): string {
  return s?.slice(0, 10) ?? '—';
}

const techniquesByTier = computed(() => {
  if (!ta.value) return [];
  const groups: Record<PhaseTier, typeof ta.value.techniques> = {
    pre: [], access: [], pivot: [], impact: [], unknown: [],
  };
  for (const t of ta.value.techniques) {
    groups[phaseTier(t.killChainPhases)].push(t);
  }
  const order: PhaseTier[] = ['pre', 'access', 'pivot', 'impact', 'unknown'];
  return order
    .filter((t) => groups[t].length > 0)
    .map((t) => ({ tier: t, items: groups[t] }));
});

const GRAPH_TECHNIQUE_LIMIT = 40;

const graph = computed<{ nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }>(() => {
  const t = ta.value;
  if (!t) return { nodes: [], edges: [], truncated: false };
  const center = `ta:${t.id}`;
  const nodes: GraphNode[] = [
    { id: center, label: t.name, type: 'TA', color: signalHex(), isCenter: true },
  ];
  const edges: GraphEdge[] = [];

  const techniques = t.techniques.slice(0, GRAPH_TECHNIQUE_LIMIT);
  for (const tech of techniques) {
    const nid = `ttp:${tech.id}`;
    nodes.push({
      id: nid,
      label: tech.id,
      type: 'TTP',
      color: tierColor(phaseTier(tech.killChainPhases)),
      routeTo: `/techniques/${tech.id}`,
    });
    edges.push({ source: center, target: nid });
  }

  return { nodes, edges, truncated: t.techniques.length > GRAPH_TECHNIQUE_LIMIT };
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
          { label: 'actors', to: '/threat-actors' },
          { label: ta?.name ?? id, mono: !ta },
        ]"
        class="mb-3"
      />
      <div v-if="ta" class="flex items-baseline justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="font-mono text-[14px] text-ink-dim tabular-nums">{{ ta.id }}</span>
          <h1 class="text-[26px] font-medium tracking-tight text-ink">{{ ta.name }}</h1>
        </div>
        <span class="font-mono text-[11px] uppercase tracking-wider text-ink-dim">
          {{ ta.techniqueCount }} ttps
        </span>
      </div>
    </header>

    <p v-if="loading && !ta" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!ta" class="text-[13px] text-ink-dim">
      threat actor not found in MITRE corpus — try ingesting again.
    </p>

    <template v-else>
      <p v-if="ta.description" class="text-[13px] leading-6 text-ink-dim max-w-[68ch] whitespace-pre-line">
        {{ ta.description }}
      </p>

      <SectionRule label="identity">
        <template #right v-if="ta.url">
          <a :href="ta.url" target="_blank" rel="noopener noreferrer" class="hover:text-ink transition">
            mitre source ↗
          </a>
        </template>
      </SectionRule>

      <dl class="grid grid-cols-[140px_1fr] gap-y-2 font-mono text-[11px]">
        <dt class="text-ink-faint uppercase tracking-wider">aliases</dt>
        <dd class="text-ink-dim">
          <span v-for="(a, i) in ta.aliases" :key="a">
            <span v-if="i > 0" class="text-ink-faint mx-1.5">·</span>
            <span :class="a === ta.name ? 'text-ink' : ''">{{ a }}</span>
          </span>
        </dd>
        <dt class="text-ink-faint uppercase tracking-wider">created</dt>
        <dd class="text-ink-dim tabular-nums">{{ fmtDate(ta.createdAt) }}</dd>
        <dt class="text-ink-faint uppercase tracking-wider">modified</dt>
        <dd class="text-ink-dim tabular-nums">{{ fmtDate(ta.modifiedAt) }}</dd>
      </dl>

      <SectionRule label="techniques">
        <template #right>
          {{ ta.techniqueCount }} grouped by attack tier
        </template>
      </SectionRule>

      <div v-if="techniquesByTier.length" class="space-y-6">
        <div v-for="group in techniquesByTier" :key="group.tier">
          <div class="flex items-baseline gap-3 mb-2">
            <span
              class="inline-block h-2 w-2 rounded-full"
              :style="{ background: tierColor(group.tier) }"
            />
            <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              {{ tierLabel(group.tier) }}
            </span>
            <span class="font-mono text-[10px] text-ink-faint tabular-nums">
              {{ group.items.length }}
            </span>
          </div>
          <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-5">
            <li v-for="tech in group.items" :key="tech.id" class="flex items-baseline gap-3 text-[12px]">
              <a
                :href="tech.url ?? undefined"
                :target="tech.url ? '_blank' : undefined"
                rel="noopener noreferrer"
                class="font-mono text-ink-dim hover:text-ink tabular-nums w-20 shrink-0 transition"
              >{{ tech.id }}</a>
              <span class="text-ink-dim truncate">{{ tech.name }}</span>
            </li>
          </ul>
        </div>
      </div>
      <p v-else class="text-[12px] text-ink-faint">no techniques recorded.</p>

      <SectionRule label="graph">
        <template #right>
          <span v-if="graph.truncated">
            top {{ graph.nodes.length - 1 }} of {{ ta.techniqueCount }}
          </span>
          <span v-else>{{ graph.nodes.length - 1 }} ttp{{ graph.nodes.length - 1 === 1 ? '' : 's' }}</span>
        </template>
      </SectionRule>

      <p class="mb-3 font-mono text-[10px] text-ink-faint">
        techniques colored by attack tier · scroll to zoom · drag to pan
      </p>

      <EntityGraph
        :nodes="graph.nodes"
        :edges="graph.edges"
        :layout="graphLayout"
        height="520px"
      />
    </template>
  </div>
</template>
