<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { useHuntDetail, useDeleteHunt } from '@/composables/useHunts';
import SectionRule from '@/components/ui/SectionRule.vue';
import SeverityWord from '@/components/ui/SeverityWord.vue';
import EntityGraph, { type GraphEdge, type GraphNode } from '@/components/graph/EntityGraph.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';
import { severityHex, severityBorderVar, inkDimHex, signalHex } from '@/utils/severity';
import { phaseTier, tierColor, tierLabel } from '@/utils/killChain';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const router = useRouter();

const { hunt, loading, error } = useHuntDetail(() => idRef.value);
const { submit: deleteSubmit, loading: deleting } = useDeleteHunt();

function fmtDate(s: string | null | undefined): string {
  return s?.slice(0, 10) ?? '—';
}

async function onDelete(): Promise<void> {
  const ok = await deleteSubmit(idRef.value);
  if (ok) router.replace('/hunts');
}

const graph = computed<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
  const h = hunt.value;
  if (!h) return { nodes: [], edges: [] };
  const center = `hunt:${h.id}`;
  const nodes: GraphNode[] = [
    { id: center, label: h.name, type: 'HUNT', color: signalHex(), isCenter: true },
  ];
  const edges: GraphEdge[] = [];

  for (const ta of h.targetActors.slice(0, 16)) {
    const nid = `ta:${ta.id}`;
    nodes.push({ id: nid, label: ta.name, type: 'TA', color: inkDimHex(), routeTo: `/threat-actors/${ta.id}` });
    edges.push({ source: center, target: nid, label: 'targets' });
  }

  for (const a of h.scopedAssets.slice(0, 16)) {
    const nid = `asset:${a.id}`;
    nodes.push({ id: nid, label: a.name, type: 'ASSET', color: inkDimHex(), routeTo: `/assets/${a.id}` });
    edges.push({ source: center, target: nid, label: 'scope' });
  }

  for (const ttp of h.findings.topTtps.slice(0, 8)) {
    const nid = `ttp:${ttp.id}`;
    nodes.push({ id: nid, label: ttp.id, type: 'TTP', color: tierColor(phaseTier(ttp.killChainPhases)), routeTo: `/techniques/${ttp.id}` });
    edges.push({ source: center, target: nid, label: 'ttp' });
  }

  for (const cve of h.findings.topCves.slice(0, 8)) {
    const nid = `cve:${cve.cveId}`;
    nodes.push({ id: nid, label: cve.cveId, type: 'CVE', color: severityHex(cve.severity), routeTo: `/cves/${cve.cveId}` });
    edges.push({ source: center, target: nid, label: 'cve' });
  }

  return { nodes, edges };
});
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'hunt', to: '/hunts' },
          { label: hunt?.name ?? id, mono: !hunt },
        ]"
        class="mb-3"
      />
      <div v-if="hunt" class="flex items-baseline justify-between gap-4">
        <div>
          <h1 class="text-[26px] font-medium tracking-tight text-ink">{{ hunt.name }}</h1>
          <p class="mt-1 font-mono text-[10px] text-ink-faint">
            <span class="uppercase tracking-wider">{{ hunt.status.toLowerCase() }}</span>
            <span class="mx-2">·</span>
            <span>created {{ fmtDate(hunt.createdAt) }}</span>
            <span class="mx-2">·</span>
            <span class="tabular-nums">{{ hunt.targetActorCount }} actors × {{ hunt.scopedAssetCount }} assets</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" :loading="deleting" @click="onDelete">delete</Button>
      </div>
    </header>

    <p v-if="loading && !hunt" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>
    <p v-else-if="!hunt" class="text-[13px] text-ink-dim">hunt not found.</p>

    <template v-else>
      <SectionRule label="findings">
        <template #right>
          <span class="tabular-nums">{{ hunt.findings.ttpCount }} ttps × {{ hunt.findings.cveCount }} cves</span>
        </template>
      </SectionRule>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-2">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">techniques · top {{ hunt.findings.topTtps.length }}</p>
          <ul v-if="hunt.findings.topTtps.length" class="space-y-1.5">
            <li v-for="t in hunt.findings.topTtps" :key="t.id" class="flex items-baseline gap-3">
              <span class="inline-block h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" :style="{ background: tierColor(phaseTier(t.killChainPhases)) }" />
              <RouterLink :to="`/techniques/${t.id}`" class="font-mono text-[11px] text-ink-dim hover:text-ink tabular-nums w-20 shrink-0 transition">{{ t.id }}</RouterLink>
              <span class="text-[12px] text-ink-dim grow truncate">{{ t.name }}</span>
              <span class="font-mono text-[10px] text-ink-faint tabular-nums shrink-0">{{ t.actorCount }}×</span>
            </li>
          </ul>
          <p v-else class="text-[12px] text-ink-faint">no ttps — selected actors have none in graph.</p>
        </div>

        <div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">vulnerabilities · top {{ hunt.findings.topCves.length }}</p>
          <ul v-if="hunt.findings.topCves.length" class="space-y-1.5">
            <li
              v-for="c in hunt.findings.topCves"
              :key="c.cveId"
              class="flex items-baseline gap-3 border-l-2 pl-3"
              :style="{ borderColor: severityBorderVar(c.severity) }"
            >
              <RouterLink :to="`/cves/${c.cveId}`" class="font-mono text-[11px] text-ink hover:text-signal tabular-nums shrink-0 transition">{{ c.cveId }}</RouterLink>
              <span v-if="c.baseScore != null" class="font-mono text-[11px] text-ink tabular-nums shrink-0">{{ c.baseScore.toFixed(1) }}</span>
              <SeverityWord :severity="c.severity" />
              <span class="font-mono text-[10px] text-ink-faint tabular-nums ml-auto shrink-0">{{ c.affectedAssetCount }} asset{{ c.affectedAssetCount === 1 ? '' : 's' }}</span>
            </li>
          </ul>
          <p v-else class="text-[12px] text-ink-faint">no cves — selected assets have no products mapped to vulnerabilities.</p>
        </div>
      </div>

      <SectionRule label="targets">
        <template #right>{{ hunt.targetActors.length }} threat actor{{ hunt.targetActors.length === 1 ? '' : 's' }}</template>
      </SectionRule>

      <ul v-if="hunt.targetActors.length" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <li v-for="ta in hunt.targetActors" :key="ta.id" class="flex items-baseline gap-3 text-[12px]">
          <RouterLink :to="`/threat-actors/${ta.id}`" class="font-mono text-ink-dim hover:text-ink tabular-nums w-16 shrink-0 transition">{{ ta.id }}</RouterLink>
          <span class="text-ink-dim hover:text-ink truncate">
            <RouterLink :to="`/threat-actors/${ta.id}`" class="hover:text-signal transition">{{ ta.name }}</RouterLink>
          </span>
          <span class="font-mono text-[10px] text-ink-faint shrink-0 ml-auto">{{ ta.techniqueCount }} ttps</span>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no actors targeted.</p>

      <SectionRule label="scope">
        <template #right>{{ hunt.scopedAssets.length }} asset{{ hunt.scopedAssets.length === 1 ? '' : 's' }}</template>
      </SectionRule>

      <ul v-if="hunt.scopedAssets.length" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <li v-for="a in hunt.scopedAssets" :key="a.id" class="flex items-baseline gap-3 text-[12px]">
          <RouterLink :to="`/assets/${a.id}`" class="text-ink-dim hover:text-signal transition truncate">{{ a.name }}</RouterLink>
          <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint shrink-0 ml-auto">{{ a.kind.toLowerCase().replace('_', ' ') }}</span>
        </li>
      </ul>
      <p v-else class="text-[12px] text-ink-faint">no assets scoped.</p>

      <SectionRule label="graph">
        <template #right>{{ graph.nodes.length - 1 }} neighbour{{ graph.nodes.length - 1 === 1 ? '' : 's' }}</template>
      </SectionRule>

      <p class="mb-3 font-mono text-[10px] text-ink-faint">
        targets · scope · top ttps (colored by attack tier) · top cves (colored by severity)
      </p>

      <EntityGraph
        :nodes="graph.nodes"
        :edges="graph.edges"
        layout="cose"
        height="520px"
      />
    </template>
  </div>
</template>
