<script setup lang="ts">
// /graph?seed=<type>:<id> — Maltego-style explorer.
//
// Phase G1 entry point. Composes HelyxGraph + ContextMenu + NodeDetailDrawer
// and wires transforms.ts via useGraphTransform. Empty/404/forbidden states
// per autoplan review (M1, M2, H3).

import { ref, computed, watch, onMounted, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@vue/apollo-composable';
import { useDebounceFn } from '@vueuse/core';
import gql from 'graphql-tag';
import HelyxGraph from '@/components/graph/HelyxGraph.vue';
import ContextMenu from '@/components/graph/ContextMenu.vue';
import NodeDetailDrawer from '@/components/graph/NodeDetailDrawer.vue';
import { transformsFor } from '@/components/graph/transforms';
import { nodeId, type GraphNode, type Transform } from '@/components/graph/graph-types';
import { useGraphTransform } from '@/composables/useGraphTransform';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { useSaveGraphAsHunt, useUpdateHuntSnapshot, useHuntGraph, useSearchEntities, useGenerateRulesFromHunt, useDownloadHuntZip, useExportHuntAsStix, useRecentStixExports, useHuntPushReadiness, useTtpMaterialize, useSetHuntReleaseTier, type TtpFacets } from '@/composables/useHunts';
import { RELEASE_TIERS, RELEASE_TIER_LABELS, type ReleaseTier } from '@/composables/useRules';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

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
// "empty" sentinel — open canvas with no seed node, only search-add available.
const isEmptyCanvas = computed(() => route.query.seed === 'empty');

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

// ─── Hunt mode (?hunt=<id>) — load saved snapshot, auto-save changes ──
const huntId = computed(() => (route.query.hunt as string | undefined) ?? null);
const { hunt, loading: huntLoading } = useHuntGraph(() => huntId.value);
const { submit: saveHunt } = useSaveGraphAsHunt();
const { submit: updateSnapshot } = useUpdateHuntSnapshot();
const { search: searchEntities } = useSearchEntities();
const { submit: generateRules, loading: generatingRules } = useGenerateRulesFromHunt();
const { submit: downloadZip, loading: downloadingZip } = useDownloadHuntZip();
const { submit: exportStix, loading: exportingStix } = useExportHuntAsStix();
const { exports: stixHistory, refetch: refetchStixHistory } = useRecentStixExports(() => huntId.value);
const stixHistoryOpen = ref(false);

const { summary: pushSummary, rows: pushRows, refetch: refetchPushReadiness } = useHuntPushReadiness(() => huntId.value);
const pushReadinessOpen = ref(false);

const KIND_CHIP_CLASS: Record<string, string> = {
  YARA:     'text-signal',
  SURICATA: 'text-sev-low',
  SIGMA:    'text-sev-med',
  CUSTOM:   'text-ink-dim',
};
const APPROVAL_CLASS: Record<string, string> = {
  approved:   'text-sev-low',
  stale:      'text-sev-med',
  unapproved: 'text-ink-faint',
};

const TLP_CLASS: Record<string, string> = {
  white:  'text-ink-dim',
  green:  'text-sev-low',
  amber:  'text-sev-med',
  red:    'text-sev-crit',
};

function tsRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
const { submit: setTier, loading: settingTier } = useSetHuntReleaseTier();

async function onChangeHuntTier(e: Event): Promise<void> {
  const next = (e.target as HTMLSelectElement).value as ReleaseTier;
  if (!huntId.value || !hunt.value || next === hunt.value.releaseTier) return;
  try {
    await setTier(huntId.value, next);
    showToast(`Hunt release tier → ${RELEASE_TIER_LABELS[next]}`, 'success');
  } catch (err) {
    showToast(`Tier change failed: ${(err as Error).message}`, 'error');
  }
}

// ─── TTP-seed mode (?ttp=T1486[&actor=...]) — H3 materialize ─────────
const ttpCode = computed(() => (route.query.ttp as string | undefined)?.toUpperCase() ?? null);
const ttpActorId = computed(() => (route.query.actor as string | undefined) ?? null);
const { submit: materializeTtp, loading: materializingTtp } = useTtpMaterialize();
const ttpFacets = ref<TtpFacets | null>(null);
const ttpCapped = ref(false);
let ttpMaterialized = false;

async function onGenerateRules(): Promise<void> {
  if (!huntId.value) return;
  const stats = await generateRules(huntId.value);
  if (!stats) {
    showToast('Generate failed', 'error');
    return;
  }
  const total = stats.yaraCount + stats.suricataCount + stats.sigmaCount;
  if (total === 0) {
    const reason = stats.skipped[0]?.reason ?? 'no IOCs/TTPs in hunt';
    showToast(`No rules generated — ${reason}`, 'info');
    return;
  }
  showToast(
    `${total} rules generated (${stats.yaraCount} YARA + ${stats.suricataCount} Suricata + ${stats.sigmaCount} Sigma) → /rules`,
    'success',
  );
}

async function onDownloadZip(): Promise<void> {
  if (!huntId.value) return;
  try {
    const packed = await downloadZip(huntId.value);
    if (!packed) {
      showToast('Download failed', 'error');
      return;
    }
    showToast(
      `Downloaded ${packed.filename} (${packed.ruleCount} rules: ${packed.yaraCount}/${packed.suricataCount}/${packed.sigmaCount})`,
      'success',
    );
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown';
    showToast(msg.includes('no generated rules') ? 'Run "Generate rules" first' : `Download failed: ${msg}`, 'error');
  }
}

// H5 — STIX export. Only F2-approved + non-stale rules ship. TLP marking
// derives from Hunt.releaseTier. Skipped counts surface to operator so
// they know exactly what stayed behind.
async function onExportStix(): Promise<void> {
  if (!huntId.value) return;
  try {
    const stix = await exportStix(huntId.value);
    if (!stix) {
      showToast('STIX export failed', 'error');
      return;
    }
    const skipNote = stix.skippedUnapproved + stix.skippedStale > 0
      ? ` (skipped ${stix.skippedUnapproved} unapproved + ${stix.skippedStale} stale)`
      : '';
    showToast(
      `STIX exported · ${stix.indicatorCount} indicators · TLP:${stix.tlp} · signed (${stix.signatureAlgorithm})${skipNote}`,
      'success',
    );
    refetchStixHistory();
    refetchPushReadiness();
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown';
    if (msg.includes('no approved rules')) {
      showToast('No approved rules — approve in /rules/<id> first', 'error');
    } else if (msg.includes('no generated rules')) {
      showToast('Run "Generate rules" first', 'error');
    } else if (msg.includes('CTI_SIGNING_MASTER_KEY')) {
      showToast('Signing key missing — set CTI_SIGNING_MASTER_KEY in backend .env', 'error');
    } else {
      showToast(`STIX export failed: ${msg}`, 'error');
    }
  }
}

// ─── Graph state ───────────────────────────────────────────────────
const graphRef = useTemplateRef<InstanceType<typeof HelyxGraph>>('graphRef');
const ctxMenu = ref<{ node: GraphNode; x: number; y: number } | null>(null);
const selected = ref<GraphNode | null>(null);
const ctxTransforms = computed<Transform[]>(() => ctxMenu.value ? transformsFor(ctxMenu.value.node.type) : []);
const saveOpen = ref(false);
const saveName = ref('');
const saving = ref(false);
const searchOpen = ref(false);
const searchQ = ref('');
const searchResults = ref<Awaited<ReturnType<typeof searchEntities>>>([]);

// Push the seed node into the graph once both seed + cy are ready.
// In hunt mode, loadHunt() takes priority over plantSeed.
let seeded = false;
async function plantSeed(): Promise<void> {
  if (seeded || !seedNode.value || !graphRef.value || huntId.value) return;
  await graphRef.value.addNodes([seedNode.value], []);
  seeded = true;
}
watch([seedNode, graphRef], plantSeed, { immediate: true });

// Hunt mode: load saved snapshot once both hunt data + cy are ready.
let huntLoaded = false;
async function loadHunt(): Promise<void> {
  if (huntLoaded || !huntId.value || !hunt.value || !graphRef.value) return;
  if (hunt.value.kind !== 'GRAPH' || !hunt.value.graphSnapshot) {
    showToast('Hunt is not graph-based', 'error');
    return;
  }
  try {
    const snap = JSON.parse(hunt.value.graphSnapshot);
    graphRef.value.loadSnapshot(snap);
    // Auto-fit: snapshot viewports often don't match the new canvas size
    // (different screen, different sidebar collapsed state, etc.).
    // Re-laying out fits everything to the available rect instead of
    // showing nodes off-screen + forcing the user to click Re-layout.
    setTimeout(() => graphRef.value?.relayoutAll(), 50);
    huntLoaded = true;
  } catch (e) {
    showToast('Failed to load hunt snapshot', 'error');
  }
}
watch([hunt, graphRef], loadHunt, { immediate: true });

// TTP-seed mode: materialize on mount, render snapshot, footer bar shows facets.
async function loadTtpSeed(): Promise<void> {
  if (ttpMaterialized || !ttpCode.value || !graphRef.value) return;
  ttpMaterialized = true;  // guard against re-fire
  try {
    const r = await materializeTtp({
      techniqueId: ttpCode.value,
      actorId: ttpActorId.value,
      proceedToGraph: true,
      capPerType: 50,
    });
    if (!r) {
      showToast('TTP materialize failed', 'error');
      ttpMaterialized = false;
      return;
    }
    ttpFacets.value = r.facets;
    ttpCapped.value = r.capped;
    if (r.graphSnapshot) {
      const snap = JSON.parse(r.graphSnapshot);
      graphRef.value.loadSnapshot(snap);
    }
    if (r.capped) {
      showToast(
        `Showing first ${r.cap} per type — refine via Actor scope to see specific subset`,
        'info',
      );
    }
  } catch (e) {
    showToast(`TTP materialize failed: ${(e as Error).message}`, 'error');
    ttpMaterialized = false;
  }
}
watch([ttpCode, graphRef], loadTtpSeed, { immediate: true });

// Auto-save: debounce 2s after any graph change. Only when in hunt mode
// (URL has ?hunt=<id>). Otherwise the graph is ephemeral.
const autoSave = useDebounceFn(async () => {
  if (!huntId.value || !graphRef.value) return;
  const snap = graphRef.value.getSnapshot();
  if (snap.nodes.length === 0) return;
  await updateSnapshot(huntId.value, JSON.stringify(snap));
}, 2000);

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
    autoSave();  // no-op outside hunt mode
  }
}

// ─── Save as Hunt ─────────────────────────────────────────────────
async function onSaveAsHunt(): Promise<void> {
  if (!graphRef.value || !saveName.value.trim()) return;
  saving.value = true;
  try {
    const snap = graphRef.value.getSnapshot();
    const created = await saveHunt({
      name: saveName.value.trim(),
      snapshot: JSON.stringify(snap),
      seedType: seed.value?.type ?? null,
      seedId: seed.value?.id ?? null,
    });
    if (created) {
      showToast(`Saved as "${created.name}"`, 'success');
      saveOpen.value = false;
      saveName.value = '';
      // Switch URL into hunt mode so subsequent edits auto-save.
      router.replace({ query: { ...route.query, hunt: created.id } });
    }
  } finally {
    saving.value = false;
  }
}

// ─── Search-add (empty canvas / mid-exploration add anything) ─────
const triggerSearch = useDebounceFn(async (q: string) => {
  searchResults.value = await searchEntities(q, 8);
}, 250);
watch(searchQ, (q) => triggerSearch(q));

async function pickSearchResult(r: { type: string; id: string; label: string; detail: string | null }): Promise<void> {
  if (!graphRef.value) return;
  const node: GraphNode = {
    id: nodeId(r.type as GraphNode['type'], r.id),
    entityId: r.id,
    type: r.type as GraphNode['type'],
    label: r.label,
    data: r.detail ? { detail: r.detail } : {},
  };
  await graphRef.value.addNodes([node], []);
  searchOpen.value = false;
  searchQ.value = '';
  searchResults.value = [];
  autoSave();
}

function onCapReached(payload: { current: number; cap: number }): void {
  showToast(`Cap reached (${payload.current}/${payload.cap}) — hide nodes to add more`, 'info');
}

function onHide(): void {
  if (!ctxMenu.value || !graphRef.value) return;
  graphRef.value.removeNode(ctxMenu.value.node.id);
  selected.value = null;
  autoSave();
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
    <!-- Empty state — only show if NO seed AND NO hunt AND not empty-canvas mode AND not ttp mode -->
    <div v-if="!seed && !huntId && !isEmptyCanvas && !ttpCode" class="h-full flex flex-col items-center justify-center px-12 text-center">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-3">graph explorer</p>
      <h1 class="text-[22px] font-medium text-ink mb-2">Pick a seed or start fresh</h1>
      <p class="text-[13px] text-ink-dim max-w-[40ch] mb-8">
        Pick an existing entity to seed exploration, or open an empty canvas and add anything via search.
      </p>
      <div class="flex items-center gap-3 mb-8">
        <Button variant="primary" @click="router.replace({ query: { ...route.query, seed: 'empty' } })">Open empty canvas</Button>
      </div>
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

    <!-- Graph with seed OR hunt OR empty-canvas mode -->
    <template v-else>
      <header class="absolute top-4 left-4 right-4 z-20 flex items-baseline justify-between gap-4 pointer-events-none">
        <div class="bg-base/80 backdrop-blur-sm border border-rule-strong rounded-md px-3 py-1.5 pointer-events-auto">
          <p class="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
            {{ huntId ? 'hunt' : (ttpCode ? `ttp seed · ${ttpCode}${ttpActorId ? ' · actor scope' : ''}` : (isEmptyCanvas ? 'empty canvas' : 'seed')) }}
          </p>
          <p class="font-mono text-[12px] text-ink mt-0.5">
            {{ huntId ? (hunt?.name ?? 'loading…') : (seedNode?.label ?? (isEmptyCanvas ? 'fresh start' : (seed?.id ?? '—'))) }}
          </p>
          <p v-if="huntId" class="font-mono text-[9px] text-ink-faint mt-0.5">
            auto-saving · last edit {{ hunt?.updatedAt?.slice(11, 16) ?? '' }}
          </p>
        </div>
        <div class="flex items-center gap-2 pointer-events-auto">
          <Button variant="ghost" @click="searchOpen = true">+ Add by search</Button>
          <!-- F1b — release tier picker, hunt-mode only -->
          <select
            v-if="huntId && hunt"
            :value="hunt.releaseTier"
            :disabled="settingTier"
            class="bg-surface border border-rule-strong rounded-md px-2 py-1 text-[11px] text-ink-dim font-mono uppercase tracking-wider"
            :title="`release tier — F1 need-to-know enforcement (push: rule.tier ≤ target.tier)`"
            @change="onChangeHuntTier"
          >
            <option v-for="t in RELEASE_TIERS" :key="t" :value="t">{{ RELEASE_TIER_LABELS[t] }}</option>
          </select>
          <Button v-if="huntId" variant="ghost" :loading="generatingRules" @click="onGenerateRules">
            Generate rules
          </Button>
          <Button v-if="huntId" variant="ghost" :loading="downloadingZip" @click="onDownloadZip">
            Download zip
          </Button>
          <Button
            v-if="huntId"
            variant="ghost"
            :loading="exportingStix"
            title="STIX 2.1 Bundle — only F2-approved + non-stale rules export. TLP marking derives from Hunt release tier."
            @click="onExportStix"
          >
            Export STIX
          </Button>
          <Button v-if="!huntId" variant="ghost" @click="saveOpen = true">Save as Hunt…</Button>
          <Button variant="ghost" @click="graphRef?.relayoutAll()">Re-layout</Button>
        </div>
      </header>

      <p
        v-if="seedLoading && !seedNode"
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] text-ink-dim"
      >loading seed…</p>

      <p
        v-if="materializingTtp && !ttpFacets"
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] text-ink-dim"
      >materializing TTP graph…</p>

      <HelyxGraph
        ref="graphRef"
        :seed-id="seed?.id ?? huntId ?? ttpCode ?? (isEmptyCanvas ? 'empty' : null)"
        :cap="200"
        @context-menu="(p) => (ctxMenu = p)"
        @node-selected="(n) => (selected = n)"
        @cap-reached="onCapReached"
      />

      <!-- F1c+: Hunt push readiness panel (hunt mode, when rules exist).
           Bottom-LEFT; mirrors stix history panel layout. Header shows
           "X/N ready at <tier>" summary; expand for per-rule matrix. -->
      <aside
        v-if="huntId && pushSummary && pushSummary.totalRules > 0"
        class="absolute bottom-4 left-4 z-20 w-[420px] bg-base/95 backdrop-blur-sm border border-rule-strong rounded-md font-mono text-[11px] shadow-lg pointer-events-auto"
      >
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface/50"
          @click="pushReadinessOpen = !pushReadinessOpen"
        >
          <span class="flex items-baseline gap-2">
            <span class="text-[10px] uppercase tracking-wider text-ink-faint">push readiness</span>
            <span class="text-ink-dim">{{ pushSummary.totalRules }} rules</span>
            <span class="text-sev-low">{{ pushSummary.approvedCount }} ✓</span>
            <span v-if="pushSummary.staleCount > 0" class="text-sev-med">{{ pushSummary.staleCount }} stale</span>
            <span v-if="pushSummary.unapprovedCount > 0" class="text-ink-faint">{{ pushSummary.unapprovedCount }} ✗</span>
          </span>
          <span class="text-ink-faint">{{ pushReadinessOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-if="pushReadinessOpen" class="border-t border-rule">
          <!-- Per-tier shipping summary -->
          <div class="grid grid-cols-4 gap-2 px-3 py-2 border-b border-rule text-[10px]">
            <div class="text-center">
              <p class="text-ink-faint uppercase">public</p>
              <p class="text-ink tabular-nums">{{ pushSummary.shipCountPublic }}/{{ pushSummary.totalRules }}</p>
            </div>
            <div class="text-center">
              <p class="text-ink-faint uppercase">cross-agency</p>
              <p class="text-ink tabular-nums">{{ pushSummary.shipCountCrossAgency }}/{{ pushSummary.totalRules }}</p>
            </div>
            <div class="text-center">
              <p class="text-ink-faint uppercase">sectoral</p>
              <p class="text-ink tabular-nums">{{ pushSummary.shipCountSectoral }}/{{ pushSummary.totalRules }}</p>
            </div>
            <div class="text-center">
              <p class="text-ink-faint uppercase">internal</p>
              <p class="text-ink tabular-nums">{{ pushSummary.shipCountInternal }}/{{ pushSummary.totalRules }}</p>
            </div>
          </div>
          <!-- Per-rule matrix -->
          <div class="max-h-[260px] overflow-y-auto">
            <div
              v-for="row in pushRows"
              :key="row.ruleId"
              class="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 border-b border-rule last:border-b-0 text-[10px]"
            >
              <router-link :to="`/rules/${row.ruleId}`" class="min-w-0">
                <p class="text-ink truncate hover:underline" :title="row.ruleName">{{ row.ruleName }}</p>
                <p class="flex gap-2 mt-0.5">
                  <span :class="['uppercase', KIND_CHIP_CLASS[row.ruleKind] ?? 'text-ink-dim']">{{ row.ruleKind }}</span>
                  <span :class="APPROVAL_CLASS[row.approvalState]">{{ row.approvalState }}</span>
                </p>
              </router-link>
              <span class="flex gap-1 text-[8px] tabular-nums shrink-0 self-center">
                <span :class="row.public.allowed ? 'text-sev-low' : 'text-ink-faint'" title="public">P</span>
                <span :class="row.crossAgency.allowed ? 'text-sev-low' : 'text-ink-faint'" title="cross-agency">C</span>
                <span :class="row.sectoral.allowed ? 'text-sev-low' : 'text-ink-faint'" title="sectoral">S</span>
                <span :class="row.internal.allowed ? 'text-sev-low' : 'text-ink-faint'" title="internal">I</span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      <!-- H5.5: STIX export history panel (hunt mode only). Collapsed
           by default; click header to expand. Surfaces signature
           provenance permanently (not just in the post-export toast). -->
      <aside
        v-if="huntId && stixHistory.length > 0"
        class="absolute bottom-4 right-4 z-20 w-[360px] bg-base/95 backdrop-blur-sm border border-rule-strong rounded-md font-mono text-[11px] shadow-lg pointer-events-auto"
      >
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface/50"
          @click="stixHistoryOpen = !stixHistoryOpen"
        >
          <span class="flex items-baseline gap-2">
            <span class="text-[10px] uppercase tracking-wider text-ink-faint">stix exports</span>
            <span class="text-ink-dim">{{ stixHistory.length }}</span>
            <span class="text-ink-faint">· last {{ tsRelative(stixHistory[0]!.ts) }}</span>
            <span :class="['uppercase', TLP_CLASS[stixHistory[0]!.tlp] ?? 'text-ink-dim']">TLP:{{ stixHistory[0]!.tlp }}</span>
          </span>
          <span class="text-ink-faint">{{ stixHistoryOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-if="stixHistoryOpen" class="border-t border-rule max-h-[280px] overflow-y-auto">
          <div
            v-for="row in stixHistory"
            :key="row.id"
            class="grid grid-cols-[80px_60px_60px_1fr] items-center gap-2 px-3 py-2 border-b border-rule last:border-b-0 text-[10px]"
            :title="`bundle ${row.bundleId}\nsigned by keypair ${row.signedByKeypairId ?? '—'}\ncontent sha256 ${row.contentHash.slice(0, 16)}…`"
          >
            <span class="text-ink-dim tabular-nums">{{ tsRelative(row.ts) }}</span>
            <span class="text-ink tabular-nums">{{ row.indicatorCount }} ind</span>
            <span :class="['uppercase', TLP_CLASS[row.tlp] ?? 'text-ink-dim']">TLP:{{ row.tlp }}</span>
            <span class="text-ink-faint truncate">sig:{{ row.signaturePrefix }}…</span>
          </div>
        </div>
      </aside>

      <!-- T1.5: persistent footer bar for TTP-seed mode (not yet saved) -->
      <footer
        v-if="ttpCode && !huntId && ttpFacets"
        class="absolute bottom-0 left-0 right-0 z-20 bg-base/95 backdrop-blur-sm border-t border-rule-strong px-6 py-3 flex items-center justify-between gap-6 pointer-events-auto"
      >
        <div class="flex items-baseline gap-5 min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint shrink-0">ttp materialize</p>
          <p class="font-mono text-[12px] text-signal shrink-0">{{ ttpFacets.techniqueId }}</p>
          <p class="text-[12px] text-ink truncate">{{ ttpFacets.techniqueName }}</p>
          <p class="font-mono text-[11px] text-ink-dim shrink-0 tabular-nums">
            {{ ttpFacets.totalNodes }} nodes · {{ ttpFacets.actorCount }}A · {{ ttpFacets.stakeholderCount }}S · {{ ttpFacets.assetCount }} assets · {{ ttpFacets.ruleCount }}R · {{ ttpFacets.artifactCount }} artifacts
          </p>
          <p v-if="ttpCapped" class="font-mono text-[10px] text-sev-med shrink-0">⚠ capped</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            @click="saveName = `TTP ${ttpFacets.techniqueId}${ttpActorId ? ` (actor ${ttpActorId.slice(0,8)})` : ''}`; saveOpen = true"
          >Save as Hunt…</Button>
          <Button variant="ghost" size="sm" @click="router.push('/hunts')">Discard</Button>
        </div>
      </footer>

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

      <!-- Save as Hunt modal -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-150"
          leave-to-class="opacity-0"
        >
          <div v-if="saveOpen" class="fixed inset-0 bg-base/60 backdrop-blur-sm z-40 flex items-center justify-center" @click="saveOpen = false">
            <div class="w-[420px] bg-base border border-rule-strong rounded-md p-6" @click.stop>
              <h3 class="text-[16px] text-ink mb-1">Save as Hunt</h3>
              <p class="text-[12px] text-ink-dim mb-4">
                Persist this graph state. Edits after save auto-save every 2s.
              </p>
              <Input v-model="saveName" label="Hunt name" placeholder="Investigation: Q3 LAN gov scan" required />
              <div class="flex items-center gap-3 mt-5">
                <Button variant="primary" :loading="saving" :disabled="!saveName.trim()" @click="onSaveAsHunt">Save</Button>
                <Button variant="ghost" @click="saveOpen = false">Cancel</Button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Search-add modal -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-150"
          leave-to-class="opacity-0"
        >
          <div v-if="searchOpen" class="fixed inset-0 bg-base/60 backdrop-blur-sm z-40 flex items-start justify-center pt-[120px]" @click="searchOpen = false">
            <div class="w-[520px] bg-base border border-rule-strong rounded-md overflow-hidden" @click.stop>
              <input
                v-model="searchQ"
                type="search"
                autofocus
                placeholder="Search any stakeholder, asset, CVE, case…"
                class="w-full bg-transparent border-b border-rule-strong px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none font-mono text-[13px]"
              />
              <ul v-if="searchResults.length" class="max-h-[320px] overflow-y-auto py-1">
                <li v-for="r in searchResults" :key="`${r.type}:${r.id}`">
                  <button
                    type="button"
                    class="w-full text-left px-4 py-2 hover:bg-surface transition flex items-baseline gap-3"
                    @click="pickSearchResult(r)"
                  >
                    <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint w-[80px] shrink-0">{{ r.type }}</span>
                    <span class="text-ink truncate flex-1">{{ r.label }}</span>
                    <span v-if="r.detail" class="font-mono text-[10px] text-ink-faint truncate max-w-[160px]">{{ r.detail }}</span>
                  </button>
                </li>
              </ul>
              <p v-else-if="searchQ" class="px-4 py-6 text-[12px] text-ink-faint italic">No matches.</p>
              <p v-else class="px-4 py-6 text-[12px] text-ink-faint italic">Type to search across all entities in this org.</p>
            </div>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>
