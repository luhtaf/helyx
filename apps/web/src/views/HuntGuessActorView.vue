<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGuessActorByTtps } from '@/composables/useThreatActors';
import { useSearchAttackPatterns } from '@/composables/useAttackPatterns';
import { useCreateHunt } from '@/composables/useHunts';
import { useToast } from '@/composables/useToast';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const { show: showToast } = useToast();

// ─── Selected TTPs (chips) ────────────────────────────────────────
// Single source of truth — pasted bulk + individually-added entries
// converge here. Order preserved (insertion order).
const selected = ref<{ id: string; name: string }[]>([]);
const selectedIds = computed(() => selected.value.map((s) => s.id));

const TCODE_RE = /T\d{4}(?:\.\d{3})?/g;

function addById(id: string, name?: string): void {
  const trimmed = id.trim().toUpperCase();
  if (!/^T\d{4}(\.\d{3})?$/.test(trimmed)) return;
  if (selectedIds.value.includes(trimmed)) return;
  selected.value.push({ id: trimmed, name: name ?? trimmed });
}

function removeAt(idx: number): void {
  selected.value.splice(idx, 1);
}

// ─── Autocomplete input ───────────────────────────────────────────
const queryRaw = ref('');
const queryDebounced = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(queryRaw, (next) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { queryDebounced.value = next; }, 200);
});

const { hits, loading: searching } = useSearchAttackPatterns(() => queryDebounced.value, 12);
// Hide already-selected from suggestions to keep dropdown actionable.
const visibleHits = computed(() => hits.value.filter((h) => !selectedIds.value.includes(h.id)));
const showDropdown = computed(() => queryRaw.value.trim().length >= 2 && (visibleHits.value.length > 0 || searching.value));

function pickHit(h: { id: string; name: string }): void {
  addById(h.id, h.name);
  queryRaw.value = '';
  queryDebounced.value = '';
}

// Paste bulk: if user pastes a string containing T-codes, parse them
// all + add. Falls back to autocomplete if no T-codes match.
function onInput(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  const matches = v.toUpperCase().match(TCODE_RE);
  if (matches && matches.length > 0) {
    for (const m of matches) addById(m);
    queryRaw.value = '';
    queryDebounced.value = '';
    return;
  }
  queryRaw.value = v;
}

function onEnter(): void {
  // Enter on a populated input: pick first hit if any, else parse as raw.
  if (visibleHits.value.length > 0) {
    pickHit(visibleHits.value[0]!);
    return;
  }
  if (/^T\d{4}(\.\d{3})?$/.test(queryRaw.value.trim().toUpperCase())) {
    addById(queryRaw.value);
    queryRaw.value = '';
    queryDebounced.value = '';
  }
}

// ─── Submit ────────────────────────────────────────────────────────
const { matches, loading, error, submit } = useGuessActorByTtps();

function onSubmit(): void {
  if (selected.value.length === 0) return;
  submit(selectedIds.value, 20);
}

function barWidth(score: number): string {
  const pct = Math.min(score / 0.5, 1) * 100;
  return `${pct.toFixed(1)}%`;
}

function openInMatrix(matchedIds: string[]): void {
  if (matchedIds.length === 0) return;
  router.push({ path: '/techniques', query: { q: matchedIds[0] } });
}

const { submit: createHunt } = useCreateHunt();
const creatingForActorId = ref<string | null>(null);

async function openAsHunt(actor: { id: string; name: string }): Promise<void> {
  if (creatingForActorId.value) return;
  creatingForActorId.value = actor.id;
  try {
    const hunt = await createHunt({
      name: `${actor.name} — guessed from TTPs`,
      targetActorIds: [actor.id],
      scopedAssetIds: [],
    });
    if (!hunt) {
      showToast('Hunt creation failed', 'error');
      return;
    }
    showToast(`Hunt created: ${actor.name}`, 'success');
    router.push(`/hunts/${hunt.id}`);
  } catch (e) {
    showToast(`Hunt creation failed: ${(e as Error).message}`, 'error');
  } finally {
    creatingForActorId.value = null;
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb :crumbs="[{ label: 'overview', to: '/' }, { label: 'hunts', to: '/hunts' }, { label: 'guess actor' }]" class="mb-3" />
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">attribution · reverse-search</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight text-ink">Guess threat actor by TTPs</h1>
      <p class="mt-2 text-[12px] text-ink-faint max-w-[68ch]">
        Search by name (e.g. <span class="font-mono">PowerShell</span>, <span class="font-mono">LSASS</span>) or paste T-codes
        (<span class="font-mono">T1059.001</span>). We rank actors by overlap — primary by raw match count, tie-broken by Jaccard score.
      </p>
    </header>

    <!-- Picker: chips + autocomplete input -->
    <section class="mb-6">
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">technique ids</p>
      <div class="rounded-md bg-surface border border-rule px-2 py-2 min-h-[44px] flex flex-wrap items-center gap-1.5 focus-within:border-ink-dim">
        <span
          v-for="(s, idx) in selected"
          :key="s.id"
          class="inline-flex items-center gap-1 font-mono text-[11px] bg-base/70 border border-rule-strong rounded-sm px-1.5 py-0.5"
          :title="s.name"
        >
          <span class="text-ink">{{ s.id }}</span>
          <span class="text-ink-faint truncate max-w-[180px]">{{ s.name }}</span>
          <button type="button" class="ml-1 text-ink-faint hover:text-sev-crit" @click="removeAt(idx)" aria-label="remove">✕</button>
        </span>
        <div class="flex-1 min-w-[160px] relative">
          <input
            :value="queryRaw"
            @input="onInput"
            @keydown.enter.prevent="onEnter"
            type="text"
            :placeholder="selected.length === 0 ? 'search by name or paste T-codes…' : 'add another…'"
            class="w-full bg-transparent border-0 px-1 py-1 font-mono text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <!-- Suggestions dropdown -->
          <div
            v-if="showDropdown"
            class="absolute z-10 left-0 right-0 mt-1 bg-base border border-rule-strong rounded-md shadow-lg max-h-[280px] overflow-y-auto"
          >
            <p v-if="searching && visibleHits.length === 0" class="px-3 py-2 font-mono text-[11px] text-ink-faint">searching…</p>
            <p v-else-if="visibleHits.length === 0" class="px-3 py-2 font-mono text-[11px] text-ink-faint">no matches</p>
            <button
              v-for="h in visibleHits"
              :key="h.id"
              type="button"
              class="w-full text-left px-3 py-1.5 hover:bg-surface flex items-baseline gap-2 font-mono text-[11px]"
              @mousedown.prevent="pickHit(h)"
            >
              <span :class="['shrink-0 w-[80px]', h.isSubtechnique ? 'text-ink-faint pl-3' : 'text-signal']">{{ h.id }}</span>
              <span class="text-ink truncate">{{ h.name }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <Button variant="primary" size="sm" :loading="loading" :disabled="selected.length === 0" @click="onSubmit">
          Guess actors
        </Button>
        <p class="font-mono text-[11px] text-ink-faint tabular-nums">selected: {{ selected.length }}</p>
      </div>
    </section>

    <p v-if="error" class="text-[13px] text-sev-crit mb-4">failed: {{ error.message }}</p>
    <p v-else-if="loading && matches.length === 0" class="text-[13px] text-ink-dim">searching…</p>

    <section v-if="matches.length > 0" class="border border-rule-strong rounded-md overflow-hidden">
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
          <router-link :to="`/threat-actors/${m.actor.id}`" class="text-ink hover:underline truncate block">
            {{ m.actor.name }}
            <span class="font-mono text-[10px] text-ink-faint ml-1">{{ m.actor.id }}</span>
          </router-link>
          <p v-if="m.actor.aliases.length > 0" class="text-[11px] text-ink-faint truncate">
            aka {{ m.actor.aliases.slice(0, 3).join(' · ') }}
          </p>
        </div>
        <p class="font-mono text-[11px] text-ink-dim text-right tabular-nums">
          {{ m.matchedCount }} / {{ m.actorTtpCount }}
        </p>
        <div class="text-right">
          <p class="font-mono text-[11px] text-ink tabular-nums">{{ (m.score * 100).toFixed(1) }}%</p>
          <div class="mt-1 h-[3px] bg-rule rounded-sm overflow-hidden">
            <div class="h-full bg-signal" :style="{ width: barWidth(m.score) }" />
          </div>
        </div>
        <div class="flex flex-wrap gap-1 min-w-0">
          <button
            v-for="tid in m.matchedTechniqueIds.slice(0, 6)"
            :key="tid"
            type="button"
            :title="`open ${tid} in matrix`"
            class="font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-rule text-ink-dim hover:border-rule-strong hover:text-ink"
            @click="openInMatrix([tid])"
          >{{ tid }}</button>
          <span v-if="m.matchedTechniqueIds.length > 6" class="font-mono text-[10px] text-ink-faint self-center">
            +{{ m.matchedTechniqueIds.length - 6 }}
          </span>
        </div>
        <div class="text-right">
          <Button
            variant="ghost"
            size="sm"
            :loading="creatingForActorId === m.actor.id"
            :disabled="creatingForActorId !== null && creatingForActorId !== m.actor.id"
            @click="openAsHunt(m.actor)"
          >Open as Hunt</Button>
        </div>
      </div>
    </section>
  </div>
</template>
