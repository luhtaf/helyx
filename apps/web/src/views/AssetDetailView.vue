<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useAssetDetail } from '@/composables/useAssets';
import type { MatchMode } from '@/composables/useDashboard';
import SectionRule from '@/components/ui/SectionRule.vue';
import SeverityWord from '@/components/ui/SeverityWord.vue';
import EntityGraph, { type GraphNode, type GraphEdge } from '@/components/graph/EntityGraph.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import { severityHex, severityBorderVar, inkDimHex, inkFaintHex, signalHex } from '@/utils/severity';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');

const mode = ref<MatchMode>('EXACT');
const { asset, loading, error } = useAssetDetail(() => idRef.value, () => mode.value);

const modes: MatchMode[] = ['EXACT', 'MAJOR_MINOR', 'MAJOR', 'BEAST'];
const modeLabel: Record<MatchMode, string> = {
  EXACT: 'exact', MAJOR_MINOR: 'maj.min', MAJOR: 'maj', BEAST: 'beast',
};

function fmtKind(k: string): string {
  return k.toLowerCase().replace('_', ' ');
}
function fmtDate(s: string | null | undefined): string {
  return s?.slice(0, 10) ?? '—';
}

function severityBorderColor(s: string | null | undefined): string {
  return severityBorderVar(s);
}

const dedupedCves = computed(() => {
  if (!asset.value?.cves) return [];
  const seen = new Set<string>();
  return asset.value.cves.filter((c) => {
    if (seen.has(c.cveId)) return false;
    seen.add(c.cveId);
    return true;
  });
});

const graph = computed<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
  const a = asset.value;
  if (!a) return { nodes: [], edges: [] };

  const centerId = `asset:${a.id}`;
  const nodes: GraphNode[] = [
    { id: centerId, label: a.name, type: 'ASSET', color: signalHex(), isCenter: true },
  ];
  const edges: GraphEdge[] = [];

  if (a.parent) {
    const pid = `asset:${a.parent.id}`;
    nodes.push({
      id: pid, label: a.parent.name, type: 'ASSET',
      color: inkDimHex(), routeTo: `/assets/${a.parent.id}`,
    });
    edges.push({ source: pid, target: centerId, label: 'contains' });
  }

  for (const child of a.children.slice(0, 12)) {
    const cid = `asset:${child.id}`;
    nodes.push({
      id: cid, label: child.name, type: 'ASSET',
      color: inkDimHex(), routeTo: `/assets/${child.id}`,
    });
    edges.push({ source: centerId, target: cid, label: 'contains' });
  }

  for (const comp of asset.value.components.slice(0, 10)) {
    const cid = `comp:${comp.id}`;
    const label = comp.version ? `${comp.name}@${comp.version}` : comp.name;
    nodes.push({ id: cid, label, type: 'COMPONENT', color: inkFaintHex() });
    edges.push({ source: centerId, target: cid, label: 'has' });
  }

  for (const cve of dedupedCves.value.slice(0, 10)) {
    const nid = `cve:${cve.cveId}`;
    nodes.push({
      id: nid, label: cve.cveId, type: 'CVE',
      color: severityHex(cve.severity), routeTo: `/cves/${cve.cveId}`,
    });
    edges.push({ source: centerId, target: nid, label: cve.mode.toLowerCase() });
  }

  return { nodes, edges };
});

const graphLayout = computed<'concentric' | 'cose'>(() =>
  graph.value.nodes.length > 10 ? 'cose' : 'concentric',
);
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'inventory', to: '/assets' },
          { label: asset?.name ?? id, mono: !asset },
        ]"
        class="mb-3"
      />
      <div v-if="asset" class="flex items-baseline justify-between gap-4">
        <h1 class="text-[26px] font-medium tracking-tight text-ink">
          {{ asset.name }}
        </h1>
        <span class="font-mono text-[11px] uppercase tracking-wider text-ink-dim">
          {{ fmtKind(asset.kind) }}
        </span>
      </div>
    </header>

    <p v-if="loading && !asset" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!asset" class="text-[13px] text-ink-dim">
      asset not found in this organization.
    </p>

    <template v-else>
      <dl class="grid grid-cols-[140px_1fr] gap-y-2 font-mono text-[11px]">
        <dt class="text-ink-faint uppercase tracking-wider">id</dt>
        <dd class="text-ink-dim break-all">{{ asset.id }}</dd>
        <dt v-if="asset.hostname" class="text-ink-faint uppercase tracking-wider">hostname</dt>
        <dd v-if="asset.hostname" class="text-ink-dim">{{ asset.hostname }}</dd>
        <dt v-if="asset.ipAddresses.length" class="text-ink-faint uppercase tracking-wider">ips</dt>
        <dd v-if="asset.ipAddresses.length" class="text-ink-dim">
          <span v-for="(ip, i) in asset.ipAddresses" :key="ip">
            <span v-if="i > 0">,&nbsp;</span>{{ ip }}
          </span>
        </dd>
        <dt class="text-ink-faint uppercase tracking-wider">created</dt>
        <dd class="text-ink-dim tabular-nums">{{ fmtDate(asset.createdAt) }}</dd>
        <dt class="text-ink-faint uppercase tracking-wider">updated</dt>
        <dd class="text-ink-dim tabular-nums">{{ fmtDate(asset.updatedAt) }}</dd>
      </dl>

      <SectionRule label="hierarchy">
        <template #right>
          {{ asset.parent ? '1 parent' : 'root' }} · {{ asset.childCount }} child{{ asset.childCount === 1 ? '' : 'ren' }}
        </template>
      </SectionRule>

      <div class="space-y-4">
        <div v-if="asset.parent">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">parent</p>
          <RouterLink
            :to="`/assets/${asset.parent.id}`"
            class="block group border-l-2 border-rule-strong pl-4 py-2 hover:border-ink-dim transition"
          >
            <span class="text-[13px] text-ink group-hover:text-signal transition">
              ↑ {{ asset.parent.name }}
            </span>
            <span class="ml-3 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {{ fmtKind(asset.parent.kind) }}
            </span>
          </RouterLink>
        </div>

        <div v-if="asset.children.length">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">children</p>
          <ul class="space-y-0">
            <li
              v-for="child in asset.children"
              :key="child.id"
              class="border-l-2 border-rule-strong pl-4 py-2 hover:border-ink-dim transition"
            >
              <RouterLink :to="`/assets/${child.id}`" class="block group">
                <span class="text-[13px] text-ink group-hover:text-signal transition">
                  ↓ {{ child.name }}
                </span>
                <span class="ml-3 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  {{ fmtKind(child.kind) }}
                </span>
                <span v-if="child.childCount > 0" class="ml-3 font-mono text-[10px] text-ink-faint tabular-nums">
                  · {{ child.childCount }} child{{ child.childCount === 1 ? '' : 'ren' }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </div>

        <p v-if="!asset.parent && !asset.children.length" class="text-[12px] text-ink-faint">
          no parent or children — standalone asset.
        </p>
      </div>

      <SectionRule label="components">
        <template #right>{{ asset.componentCount }}</template>
      </SectionRule>

      <ul v-if="asset.components.length" class="space-y-2">
        <li v-for="comp in asset.components" :key="comp.id" class="font-mono text-[12px]">
          <span class="text-ink">{{ comp.name }}</span>
          <span v-if="comp.version" class="ml-2 text-ink-dim tabular-nums">{{ comp.version }}</span>
          <span v-if="comp.type" class="ml-2 text-[10px] uppercase tracking-wider text-ink-faint">
            {{ comp.type }}
          </span>
          <p class="mt-0.5 text-[10px] text-ink-faint break-all">
            {{ comp.purl }}
            <template v-if="comp.cpeUri">
              <span class="mx-2">·</span>
              <span class="text-ink-dim">{{ comp.cpeUri }}</span>
            </template>
          </p>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">
        no components recorded — ingest an SBOM to populate.
      </p>

      <SectionRule label="vulnerabilities">
        <template #right>
          <span class="flex items-center gap-2">
            <span>{{ asset.cveCount }}</span>
            <span class="text-ink-faint">·</span>
            <template v-for="(m, i) in modes" :key="m">
              <span v-if="i > 0" class="text-ink-faint">/</span>
              <button
                type="button"
                :class="['transition', mode === m ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
                @click="mode = m"
              >{{ modeLabel[m] }}</button>
            </template>
          </span>
        </template>
      </SectionRule>

      <ul v-if="dedupedCves.length" class="space-y-0">
        <li
          v-for="cve in dedupedCves"
          :key="cve.cveId"
          class="border-l-2 pl-4 py-3"
          :style="{ borderColor: severityBorderColor(cve.severity) }"
        >
          <RouterLink :to="`/cves/${cve.cveId}`" class="block group">
            <div class="flex items-baseline justify-between gap-4">
              <span class="font-mono text-[14px] text-ink group-hover:text-signal transition">
                {{ cve.cveId }}
              </span>
              <div class="flex items-baseline gap-3 shrink-0">
                <span v-if="cve.baseScore != null" class="font-mono text-[14px] text-ink tabular-nums">
                  {{ cve.baseScore.toFixed(1) }}
                </span>
                <SeverityWord :severity="cve.severity" />
              </div>
            </div>
            <p class="mt-1 font-mono text-[10px] text-ink-faint break-all">
              via {{ cve.componentPurl }}
            </p>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">
        no vulnerabilities matched at <span class="font-mono">{{ modeLabel[mode] }}</span> mode.
      </p>

      <SectionRule label="graph">
        <template #right>
          {{ graph.nodes.length - 1 }} neighbour{{ graph.nodes.length - 1 === 1 ? '' : 's' }}
          · cves @ {{ modeLabel[mode] }}
        </template>
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
