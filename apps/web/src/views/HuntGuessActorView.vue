<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGuessActorByTtps } from '@/composables/useThreatActors';
import { useCreateHunt } from '@/composables/useHunts';
import { useToast } from '@/composables/useToast';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const { show: showToast } = useToast();
const raw = ref('');
const creatingForActorId = ref<string | null>(null);

const TCODE_RE = /T\d{4}(?:\.\d{3})?/g;
const parsedIds = computed(() => {
  const matches = raw.value.toUpperCase().match(TCODE_RE) ?? [];
  return Array.from(new Set(matches));
});

const { matches, loading, error, submit } = useGuessActorByTtps();

function onSubmit(): void {
  if (parsedIds.value.length === 0) return;
  submit(parsedIds.value, 20);
}

// Bar fill — Jaccard 0..1 → 0..100% width. Cap visual at score=0.5
// so the bar reads better in the typical 0.05-0.30 range we see with
// real MITRE coverage. Rare 1.0-perfect-match still maxes out.
function barWidth(score: number): string {
  const pct = Math.min(score / 0.5, 1) * 100;
  return `${pct.toFixed(1)}%`;
}

function openInMatrix(matchedIds: string[]): void {
  // Pick the first matched TTP and open in matrix highlighted. Future:
  // multi-highlight when matrix supports it.
  if (matchedIds.length === 0) return;
  router.push({ path: '/techniques', query: { q: matchedIds[0] } });
}

const { submit: createHunt } = useCreateHunt();

// C++ — Convert a guess result row into an actionable Hunt. Pre-populates
// the new structured Hunt with this actor as the only target so analyst
// goes from "this is who I think it is" to "let me investigate" in one
// click. No asset scope — let analyst add inventory inside Hunt later.
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
        Paste or type MITRE technique IDs. We rank threat actors by overlap
        with your set — primary by raw match count (more of your TTPs covered
        = higher), tie-broken by Jaccard score (how dominant your TTPs are
        in that actor's repertoire).
      </p>
    </header>

    <section class="mb-6">
      <label class="block">
        <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">technique ids</span>
        <textarea
          v-model="raw"
          rows="3"
          placeholder="e.g. T1059.001, T1003.001, T1071.001 — comma or whitespace separated"
          class="w-full rounded-md bg-surface border border-rule px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink-dim"
        />
      </label>
      <div class="mt-3 flex items-center gap-3">
        <Button variant="primary" size="sm" :loading="loading" :disabled="parsedIds.length === 0" @click="onSubmit">
          Guess actors
        </Button>
        <p class="font-mono text-[11px] text-ink-faint tabular-nums">
          parsed: {{ parsedIds.length }}<span v-if="parsedIds.length > 0"> · {{ parsedIds.slice(0, 6).join(' · ') }}<span v-if="parsedIds.length > 6"> …</span></span>
        </p>
      </div>
    </section>

    <p v-if="error" class="text-[13px] text-sev-crit mb-4">failed: {{ error.message }}</p>
    <p v-else-if="loading && matches.length === 0" class="text-[13px] text-ink-dim">searching…</p>
    <p v-else-if="!loading && matches.length === 0 && parsedIds.length > 0 && error == null" class="text-[13px] text-ink-dim">
      no actors match these TTPs (or you haven't submitted yet — click Guess actors).
    </p>

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
