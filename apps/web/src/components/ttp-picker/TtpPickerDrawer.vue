<script setup lang="ts">
// Bottom-sheet drawer with Matrix tree as multi-select picker. Slides
// up from below, ~75vh, dim backdrop. Reuses useMatrix data + reuses
// the column shape from MatrixColumn but renders a click-to-toggle
// tile (no router-link) instead of the read-only TechniqueCard.
//
// Action context — buttons in the bottom bar adapt to the current
// route. /graph?hunt=X gets "+ Add to graph"; everywhere gets
// "Guess actor" + "TTP-seed first selected".

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useApolloClient } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import { useTtpSelection } from '@/composables/useTtpSelection';
import { useMatrix } from '@/composables/useMatrix';
import { useGuessActorByTtps, type ActorMatch } from '@/composables/useThreatActors';
import { useSaveGraphAsHunt } from '@/composables/useHunts';
import { useToast } from '@/composables/useToast';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';

const ttp = useTtpSelection();
const router = useRouter();
const route = useRoute();
const { client } = useApolloClient();
const { show: showToast } = useToast();

// Drawer modes — picker (default, click matrix tiles) vs results (after
// Guess actor: shows ranked list inline). Switching modes keeps the
// operator in flow without page navigation.
type Mode = 'pick' | 'results';
const mode = ref<Mode>('pick');
watch(() => ttp.isOpen.value, (open) => {
  if (open) mode.value = 'pick'; // re-open always lands on picker
});

const platform = ref('');
const search = ref('');
const showSubtechniques = ref(true);

const { columns, loading } = useMatrix(() => ({
  platform: platform.value || null,
  search: search.value.trim() || null,
}));

const visibleColumns = computed(() =>
  columns.value
    .map((c) => ({
      ...c,
      techniques: showSubtechniques.value
        ? c.techniques
        : c.techniques.filter((t) => !t.isSubtechnique),
    }))
    .filter((c) => c.techniques.length > 0),
);

// ─── Actions (context-sensitive) ──────────────────────────────────
// `/graph?hunt=X` adds the "Add to graph" action. Other actions are
// always present.
const isOnHuntGraph = computed(() => route.path === '/graph' && Boolean(route.query.hunt));

// ─── Guess flow inline (no page navigation) ──────────────────────
const { matches, loading: guessing, submit: submitGuess } = useGuessActorByTtps();
const { submit: saveGraphAsHunt } = useSaveGraphAsHunt();
const creatingForActorId = ref<string | null>(null);

const ACTOR_TTPS_FOR_GRAPH = gql`
  query ActorTtpsForGraph($id: ID!) {
    threatActor(id: $id) { id name techniques { id name isSubtechnique } }
  }
`;

function onGuessActor(): void {
  if (ttp.count.value === 0) return;
  submitGuess(ttp.selectedIds.value, 20);
  mode.value = 'results';
}

function backToPicker(): void {
  mode.value = 'pick';
}

interface SnapNode { id: string; type: string; entityId: string; label: string; data: Record<string, unknown>; position: { x: number; y: number }; locked: boolean }
interface SnapEdge { id: string; source: string; target: string; edgeType: string; label: string }

function buildActorSnapshot(actor: { id: string; name: string }, ttps: Array<{ id: string; name: string }>): string {
  const actorNodeId = `ThreatActor:${actor.id}`;
  const actorData = { id: actorNodeId, type: 'ThreatActor', entityId: actor.id, label: actor.name };
  const nodes: SnapNode[] = [
    { ...actorData, data: actorData, position: { x: 0, y: 0 }, locked: false },
  ];
  const edges: SnapEdge[] = [];
  const radius = Math.max(280, ttps.length * 9);
  ttps.forEach((t, idx) => {
    const tNodeId = `AttackPattern:${t.id}`;
    const angle = (idx / Math.max(1, ttps.length)) * 2 * Math.PI;
    const tData = { id: tNodeId, type: 'AttackPattern', entityId: t.id, label: t.name };
    nodes.push({ ...tData, data: tData, position: { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) }, locked: false });
    edges.push({ id: `${actorNodeId}->${tNodeId}:USES`, source: actorNodeId, target: tNodeId, edgeType: 'USES', label: 'USES' });
  });
  return JSON.stringify({ nodes, edges, viewport: { zoom: 0.6, pan: { x: 0, y: 0 } } });
}

async function openActorAsHunt(actor: ActorMatch['actor']): Promise<void> {
  if (creatingForActorId.value) return;
  creatingForActorId.value = actor.id;
  try {
    const r = await client.query<{ threatActor: { id: string; name: string; techniques: Array<{ id: string; name: string }> } | null }>({
      query: ACTOR_TTPS_FOR_GRAPH,
      variables: { id: actor.id },
      fetchPolicy: 'network-only',
    });
    const detail = r.data.threatActor;
    if (!detail) { showToast('Could not load actor techniques', 'error'); return; }
    const snapshot = buildActorSnapshot(actor, detail.techniques);
    const hunt = await saveGraphAsHunt({
      name: `${actor.name} — guessed from TTPs`,
      snapshot,
      seedType: 'ThreatActor',
      seedId: actor.id,
    });
    if (!hunt) { showToast('Hunt creation failed', 'error'); return; }
    showToast(`Hunt created: ${actor.name} · ${detail.techniques.length} TTPs`, 'success');
    ttp.close();
    router.push(`/graph?hunt=${hunt.id}`);
  } catch (e) {
    showToast(`Hunt creation failed: ${(e as Error).message}`, 'error');
  } finally {
    creatingForActorId.value = null;
  }
}

function barWidth(score: number): string {
  const pct = Math.min(score / 0.5, 1) * 100;
  return `${pct.toFixed(1)}%`;
}

function onTtpSeedFirst(): void {
  const first = ttp.selected.value[0];
  if (!first) return;
  ttp.close();
  router.push({ path: '/graph', query: { ttp: first.id } });
}

// `/graph?hunt=X` cooperative handoff — drop chosen TTPs as cytoscape
// nodes via a global event. GraphView listens. Simpler than a tight
// import coupling drawer → graph internals.
function onAddToGraph(): void {
  if (ttp.count.value === 0) return;
  window.dispatchEvent(new CustomEvent('helyx:add-ttps-to-graph', {
    detail: { ttps: ttp.selected.value.slice() },
  }));
  ttp.close();
}

// ─── Esc to close ─────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ttp.isOpen.value) ttp.close();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

// Close drawer auto-clear search? No — keep filter sticky during a
// session so re-opens are fast. Selection persists across opens too.
watch(() => ttp.isOpen.value, (open) => {
  if (open) {
    // Lock body scroll while drawer is open.
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="ttp.isOpen.value" class="fixed inset-0 bg-base/60 backdrop-blur-sm z-40" @click="ttp.close()" />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-200"
      enter-from-class="translate-y-full"
      leave-active-class="transition-transform duration-200"
      leave-to-class="translate-y-full"
    >
      <aside
        v-if="ttp.isOpen.value"
        class="fixed bottom-0 left-0 right-0 z-50 h-[75vh] bg-base border-t border-rule-strong shadow-2xl flex flex-col"
        @click.stop
      >
        <!-- Top: title + filters (picker mode) OR results header -->
        <header class="border-b border-rule-strong px-6 py-3 shrink-0">
          <div class="flex items-baseline justify-between gap-4 mb-3">
            <div>
              <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {{ mode === 'pick' ? 'ttp picker' : 'guessed actors' }}
              </p>
              <h2 class="text-[16px] text-ink mt-0.5">
                {{ mode === 'pick' ? 'ATT&CK Matrix · click to select' : `Ranked actors for ${ttp.count.value} TTPs` }}
              </h2>
            </div>
            <div class="flex items-center gap-3">
              <button v-if="mode === 'results'" type="button" @click="backToPicker" class="font-mono text-[11px] text-ink-faint hover:text-ink">← back to picker</button>
              <button type="button" @click="ttp.close()" class="font-mono text-[11px] text-ink-faint hover:text-ink">esc · close</button>
            </div>
          </div>
          <div v-if="mode === 'pick'" class="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <label class="flex items-center gap-2 text-ink-dim">
              <span class="text-ink-faint">platform</span>
              <select v-model="platform" class="h-8 rounded-md bg-surface border border-rule px-2 text-ink focus:outline-none focus:border-ink-dim">
                <option value="">all</option>
                <option v-for="p in ['windows', 'macos', 'linux', 'network', 'containers', 'office-suite', 'iaas', 'saas']" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
            <Input v-model="search" type="search" placeholder="technique name or id" class="!h-8 w-[220px]" />
            <label class="flex items-center gap-2 text-ink-dim cursor-pointer select-none">
              <input v-model="showSubtechniques" type="checkbox" class="h-4 w-4 rounded-[2px] border border-rule bg-surface accent-[var(--signal)]" />
              <span class="text-ink-faint">sub-techniques</span>
            </label>
          </div>
        </header>

        <!-- Middle: matrix tree (picker) OR ranked actor table (results) -->
        <div v-if="mode === 'pick'" class="flex-1 overflow-x-auto overflow-y-hidden">
          <div class="flex h-full">
            <p v-if="loading && visibleColumns.length === 0" class="m-auto text-[13px] text-ink-dim">loading matrix…</p>
            <section
              v-for="col in visibleColumns"
              :key="col.tactic.id"
              class="w-[180px] shrink-0 border-r border-rule h-full flex flex-col"
            >
              <header class="border-b border-rule-strong px-3 py-2 bg-base/95 sticky top-0 z-10">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="text-[12px] font-medium text-ink truncate">{{ col.tactic.name }}</p>
                  <span class="font-mono text-[10px] text-ink-faint tabular-nums">{{ col.techniques.length }}</span>
                </div>
              </header>
              <div class="flex-1 overflow-y-auto px-1.5 py-2">
                <button
                  v-for="t in col.techniques"
                  :key="t.id"
                  type="button"
                  @click="ttp.toggle({ id: t.id, name: t.name, isSubtechnique: t.isSubtechnique })"
                  :class="[
                    'block w-full text-left rounded-[2px] border px-2 py-1.5 transition mb-0.5',
                    t.isSubtechnique ? 'pl-4' : '',
                    ttp.has(t.id)
                      ? 'border-signal bg-signal/10 text-ink'
                      : 'border-transparent hover:bg-surface text-ink-dim hover:text-ink',
                  ]"
                >
                  <p class="font-mono text-[10px] tabular-nums" :class="ttp.has(t.id) ? 'text-signal' : 'text-ink-faint'">
                    {{ t.id }}
                  </p>
                  <p class="text-[11px] line-clamp-1">{{ t.name }}</p>
                </button>
              </div>
            </section>
          </div>
        </div>

        <!-- Results panel (when mode === 'results') -->
        <div v-else class="flex-1 overflow-y-auto px-6 py-4">
          <p v-if="guessing && matches.length === 0" class="text-[13px] text-ink-dim">searching…</p>
          <p v-else-if="!guessing && matches.length === 0" class="text-[13px] text-ink-dim">no actors match these TTPs.</p>
          <div v-else class="border border-rule-strong rounded-md overflow-hidden">
            <header class="grid grid-cols-[3fr_120px_70px_2fr_110px] gap-3 px-4 py-2 border-b border-rule font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              <span>actor</span>
              <span class="text-right">match / actor ttps</span>
              <span class="text-right">score</span>
              <span>matched ttps</span>
              <span class="text-right">action</span>
            </header>
            <div
              v-for="m in matches"
              :key="m.actor.id"
              class="grid grid-cols-[3fr_120px_70px_2fr_110px] gap-3 items-center px-4 py-3 border-b border-rule last:border-b-0 hover:bg-surface/50 transition"
            >
              <div class="min-w-0">
                <p class="text-ink truncate">
                  {{ m.actor.name }}
                  <span class="font-mono text-[10px] text-ink-faint ml-1">{{ m.actor.id }}</span>
                </p>
                <p v-if="m.actor.aliases.length > 0" class="text-[11px] text-ink-faint truncate">
                  aka {{ m.actor.aliases.slice(0, 3).join(' · ') }}
                </p>
              </div>
              <p class="font-mono text-[11px] text-ink-dim text-right tabular-nums">{{ m.matchedCount }} / {{ m.actorTtpCount }}</p>
              <div class="text-right">
                <p class="font-mono text-[11px] text-ink tabular-nums">{{ (m.score * 100).toFixed(1) }}%</p>
                <div class="mt-1 h-[3px] bg-rule rounded-sm overflow-hidden">
                  <div class="h-full bg-signal" :style="{ width: barWidth(m.score) }" />
                </div>
              </div>
              <div class="flex flex-wrap gap-1 min-w-0">
                <span
                  v-for="tid in m.matchedTechniqueIds.slice(0, 6)"
                  :key="tid"
                  class="font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-rule text-ink-dim"
                >{{ tid }}</span>
                <span v-if="m.matchedTechniqueIds.length > 6" class="font-mono text-[10px] text-ink-faint self-center">
                  +{{ m.matchedTechniqueIds.length - 6 }}
                </span>
              </div>
              <div class="text-right">
                <Button
                  variant="primary"
                  size="sm"
                  :loading="creatingForActorId === m.actor.id"
                  :disabled="creatingForActorId !== null && creatingForActorId !== m.actor.id"
                  @click="openActorAsHunt(m.actor)"
                >Open in graph →</Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom: selection bar + actions (picker mode only) -->
        <footer v-if="mode === 'pick'" class="border-t border-rule-strong px-6 py-3 shrink-0 bg-surface/30">
          <div class="flex items-center gap-3 mb-2">
            <span class="font-mono text-[11px] text-ink-faint tabular-nums shrink-0">
              {{ ttp.count.value }} selected
            </span>
            <div class="flex flex-wrap gap-1 flex-1 min-w-0 max-h-[60px] overflow-y-auto">
              <span
                v-for="s in ttp.selected.value"
                :key="s.id"
                class="inline-flex items-center gap-1 font-mono text-[10px] bg-base/80 border border-rule-strong rounded-sm px-1.5 py-0.5"
                :title="s.name"
              >
                <span :class="s.isSubtechnique ? 'text-ink-dim' : 'text-signal'">{{ s.id }}</span>
                <button type="button" class="text-ink-faint hover:text-sev-crit" @click="ttp.remove(s.id)" aria-label="remove">✕</button>
              </span>
            </div>
            <button
              v-if="ttp.count.value > 0"
              type="button"
              class="shrink-0 font-mono text-[10px] text-ink-faint hover:text-sev-crit"
              @click="ttp.clear()"
            >clear all</button>
          </div>
          <div class="flex items-center justify-end gap-2">
            <Button
              v-if="isOnHuntGraph"
              variant="ghost"
              size="sm"
              :disabled="ttp.count.value === 0"
              @click="onAddToGraph"
            >+ Add to graph</Button>
            <Button
              variant="ghost"
              size="sm"
              :disabled="ttp.count.value === 0"
              @click="onTtpSeedFirst"
              :title="'Materialize first selected TTP — ' + (ttp.selected.value[0]?.id ?? '')"
            >Materialize first →</Button>
            <Button
              variant="primary"
              size="sm"
              :disabled="ttp.count.value === 0"
              @click="onGuessActor"
            >Guess actor →</Button>
          </div>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
