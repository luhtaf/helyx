<script setup lang="ts">
// Mode 3 of HuntCreateView: guess threat actor by TTPs (reverse
// attribution). TTP selection lives in the global useTtpSelection
// store — operator picks via the bottom-right ▤ TTPs drawer.
//
// Empty state coaches them to open the picker. Once selection has
// content the panel auto-submits + renders ranked actors.

import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGuessActorByTtps } from '@/composables/useThreatActors';
import { useCreateHunt } from '@/composables/useHunts';
import { useToast } from '@/composables/useToast';
import { useTtpSelection } from '@/composables/useTtpSelection';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const { show: showToast } = useToast();
const ttp = useTtpSelection();

const { matches, loading, error, submit } = useGuessActorByTtps();

// Auto-submit on selection change (debounced one tick) so the operator
// goes "open drawer → click 3 TTPs → close → ranked list already there".
let submitTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => ttp.selectedIds.value, (ids) => {
  if (submitTimer) clearTimeout(submitTimer);
  if (ids.length === 0) return;
  submitTimer = setTimeout(() => submit(ids, 20), 150);
}, { immediate: true, deep: true });

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
    if (!hunt) { showToast('Hunt creation failed', 'error'); return; }
    showToast(`Hunt created: ${actor.name}`, 'success');
    router.push(`/hunts/${hunt.id}`);
  } catch (e) {
    showToast(`Hunt creation failed: ${(e as Error).message}`, 'error');
  } finally {
    creatingForActorId.value = null;
  }
}

const hasSelection = computed(() => ttp.count.value > 0);
</script>

<template>
  <div>
    <!-- Selection summary + opener -->
    <section class="mb-6 flex items-start gap-4 p-4 border border-rule rounded-md bg-surface/30">
      <div class="flex-1 min-w-0">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">selected ttps</p>
        <div v-if="hasSelection" class="flex flex-wrap gap-1.5">
          <span
            v-for="s in ttp.selected.value"
            :key="s.id"
            class="inline-flex items-center gap-1 font-mono text-[11px] bg-base/70 border border-rule-strong rounded-sm px-1.5 py-0.5"
            :title="s.name"
          >
            <span :class="s.isSubtechnique ? 'text-ink-dim' : 'text-signal'">{{ s.id }}</span>
            <span class="text-ink-faint truncate max-w-[180px]">{{ s.name }}</span>
            <button type="button" class="text-ink-faint hover:text-sev-crit" @click="ttp.remove(s.id)" aria-label="remove">✕</button>
          </span>
        </div>
        <p v-else class="text-[12px] text-ink-faint">
          No TTPs selected. Open the <span class="font-mono">▤ ttps</span> picker (bottom-right) and click techniques to add them.
        </p>
      </div>
      <Button variant="ghost" size="sm" @click="ttp.open()">
        {{ hasSelection ? 'Edit selection' : 'Open picker' }}
      </Button>
    </section>

    <p v-if="error" class="text-[13px] text-sev-crit mb-4">failed: {{ error.message }}</p>
    <p v-else-if="loading && matches.length === 0 && hasSelection" class="text-[13px] text-ink-dim">searching…</p>
    <p v-else-if="!hasSelection && matches.length === 0" class="text-[13px] text-ink-faint">
      Pick at least 1 TTP to see ranked actors.
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
        <p class="font-mono text-[11px] text-ink-dim text-right tabular-nums">{{ m.matchedCount }} / {{ m.actorTtpCount }}</p>
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
