<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useCveDetail } from '@/composables/useCves';
import SectionRule from '@/components/ui/SectionRule.vue';
import SeverityWord from '@/components/ui/SeverityWord.vue';
import EntityGraph, { type GraphNode, type GraphEdge } from '@/components/graph/EntityGraph.vue';
import { severityHex, severityBorderVar, inkDimHex, inkFaintHex } from '@/utils/severity';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');

const { cve, loading, error } = useCveDetail(() => idRef.value);

const severityBorderColor = computed(() =>
  severityBorderVar(cve.value?.cvssV31BaseSeverity),
);

function fmtDate(s: string | null | undefined): string {
  return s?.slice(0, 10) ?? '—';
}

function modeColor(mode: 'EXACT' | 'BEAST'): string {
  return mode === 'EXACT' ? 'text-signal' : 'text-ink-faint';
}

const graph = computed<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
  const c = cve.value;
  if (!c) return { nodes: [], edges: [] };
  const nodes: GraphNode[] = [
    {
      id: c.id,
      label: c.id,
      type: 'CVE',
      color: severityHex(c.cvssV31BaseSeverity),
      isCenter: true,
    },
  ];
  const edges: GraphEdge[] = [];

  for (const w of c.weaknesses) {
    nodes.push({ id: `cwe:${w.id}`, label: w.id, type: 'CWE', color: inkFaintHex() });
    edges.push({ source: c.id, target: `cwe:${w.id}`, label: 'cwe' });
  }

  for (const a of c.affectedAssets.items) {
    const nid = `asset:${a.asset.id}`;
    nodes.push({
      id: nid,
      label: a.asset.name,
      type: 'ASSET',
      color: inkDimHex(),
      routeTo: `/assets/${a.asset.id}`,
    });
    edges.push({ source: c.id, target: nid, label: a.matchMode.toLowerCase() });
  }

  return { nodes, edges };
});

const graphLayout = computed<'concentric' | 'cose'>(() =>
  graph.value.nodes.length > 8 ? 'cose' : 'concentric',
);
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <div class="flex items-baseline justify-between mb-3">
        <RouterLink to="/cves" class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim hover:text-ink transition">
          ← cve ledger
        </RouterLink>
        <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
          cve · detail
        </p>
      </div>
      <div
        class="flex items-baseline justify-between gap-4 border-l-2 pl-4 py-1"
        :style="{ borderColor: severityBorderColor }"
      >
        <h1 class="font-mono text-[26px] font-medium text-ink tabular-nums">
          {{ id }}
        </h1>
        <div v-if="cve" class="flex items-baseline gap-4 shrink-0">
          <span v-if="cve.cvssV31BaseScore != null" class="font-mono text-[24px] text-ink tabular-nums">
            {{ cve.cvssV31BaseScore.toFixed(1) }}
          </span>
          <SeverityWord :severity="cve.cvssV31BaseSeverity" size="sm" />
        </div>
      </div>
    </header>

    <p v-if="loading && !cve" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!cve" class="text-[13px] text-ink-dim">
      cve not found in graph.
    </p>

    <template v-else>
      <p class="text-[13px] leading-6 text-ink-dim max-w-[68ch]">
        {{ cve.description ?? '—' }}
      </p>

      <SectionRule label="metrics">
        <template #right v-if="cve.vulnStatus">{{ cve.vulnStatus.toLowerCase() }}</template>
      </SectionRule>

      <dl class="grid grid-cols-[140px_1fr] gap-y-2 font-mono text-[11px]">
        <dt class="text-ink-faint uppercase tracking-wider">published</dt>
        <dd class="text-ink-dim tabular-nums">{{ fmtDate(cve.publishedAt) }}</dd>
        <dt class="text-ink-faint uppercase tracking-wider">last modified</dt>
        <dd class="text-ink-dim tabular-nums">{{ fmtDate(cve.lastModifiedAt) }}</dd>
        <dt class="text-ink-faint uppercase tracking-wider">source</dt>
        <dd class="text-ink-dim">{{ cve.sourceIdentifier ?? '—' }}</dd>
        <template v-if="cve.cvssV31VectorString">
          <dt class="text-ink-faint uppercase tracking-wider">cvss v3.1</dt>
          <dd class="text-ink-dim break-all">
            {{ cve.cvssV31VectorString }}
            <span v-if="cve.cvssV31BaseScore != null" class="ml-2 text-ink tabular-nums">
              ({{ cve.cvssV31BaseScore.toFixed(1) }} {{ cve.cvssV31BaseSeverity?.toLowerCase() }})
            </span>
          </dd>
        </template>
        <template v-if="cve.cvssV2VectorString">
          <dt class="text-ink-faint uppercase tracking-wider">cvss v2</dt>
          <dd class="text-ink-dim break-all">
            {{ cve.cvssV2VectorString }}
            <span v-if="cve.cvssV2BaseScore != null" class="ml-2 text-ink tabular-nums">
              ({{ cve.cvssV2BaseScore.toFixed(1) }} {{ cve.cvssV2BaseSeverity?.toLowerCase() }})
            </span>
          </dd>
        </template>
      </dl>

      <SectionRule label="weaknesses">
        <template #right>{{ cve.weaknesses.length }}</template>
      </SectionRule>

      <ul v-if="cve.weaknesses.length" class="space-y-1.5">
        <li
          v-for="w in cve.weaknesses"
          :key="w.id"
          class="flex items-baseline gap-3"
        >
          <RouterLink :to="`/cwe/${w.id}`" class="font-mono text-[12px] text-ink tabular-nums w-24 hover:text-signal transition">{{ w.id }}</RouterLink>
          <span v-if="w.name" class="text-[12px] text-ink-dim">{{ w.name }}</span>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no CWE links recorded.</p>

      <SectionRule label="references">
        <template #right>{{ cve.references.length }}</template>
      </SectionRule>

      <ul v-if="cve.references.length" class="space-y-2">
        <li v-for="r in cve.references" :key="r.url" class="text-[12px]">
          <a
            :href="r.url"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono text-ink hover:text-signal break-all transition"
          >{{ r.url }}</a>
          <p v-if="r.source || r.tags.length" class="mt-0.5 font-mono text-[10px] text-ink-faint">
            <span v-if="r.source">{{ r.source }}</span>
            <span v-if="r.source && r.tags.length" class="mx-2">·</span>
            <span v-for="(tag, i) in r.tags" :key="tag">
              <span v-if="i > 0" class="mx-1.5 text-ink-faint">·</span>
              <span class="text-ink-dim">{{ tag.toLowerCase() }}</span>
            </span>
          </p>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no references recorded.</p>

      <SectionRule label="affected assets">
        <template #right>
          {{ cve.affectedAssets.total }} in this org
        </template>
      </SectionRule>

      <ul v-if="cve.affectedAssets.items.length" class="space-y-0">
        <li
          v-for="row in cve.affectedAssets.items"
          :key="row.asset.id"
          class="border-l-2 pl-4 py-3"
          :style="{ borderColor: row.matchMode === 'EXACT' ? 'var(--ink)' : 'var(--rule-strong)' }"
        >
          <RouterLink :to="`/assets/${row.asset.id}`" class="block group">
            <div class="flex items-baseline justify-between gap-4">
              <span class="text-[13px] text-ink group-hover:text-signal transition">
                {{ row.asset.name }}
              </span>
              <span :class="['font-mono text-[10px] uppercase tracking-wider', modeColor(row.matchMode)]">
                {{ row.matchMode.toLowerCase() }}
              </span>
            </div>
            <p class="mt-1 font-mono text-[10px] text-ink-faint">
              <span class="text-ink-dim uppercase">{{ row.asset.kind.toLowerCase().replace('_', ' ') }}</span>
              <span v-if="row.componentPurl" class="mx-2">·</span>
              <span v-if="row.componentPurl" class="break-all">via {{ row.componentPurl }}</span>
              <span v-if="row.asset.ipAddresses.length" class="mx-2">·</span>
              <span v-for="(ip, i) in row.asset.ipAddresses" :key="ip">
                <span v-if="i > 0">,</span>{{ ip }}
              </span>
            </p>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">
        not present in this organization's inventory.
      </p>

      <SectionRule label="graph">
        <template #right>
          {{ graph.nodes.length - 1 }} neighbour{{ graph.nodes.length - 1 === 1 ? '' : 's' }}
        </template>
      </SectionRule>

      <p class="mb-3 font-mono text-[10px] text-ink-faint">
        click any neighbour node to navigate · scroll to zoom · drag to pan
      </p>

      <EntityGraph
        :nodes="graph.nodes"
        :edges="graph.edges"
        :layout="graphLayout"
        height="420px"
      />
    </template>
  </div>
</template>
