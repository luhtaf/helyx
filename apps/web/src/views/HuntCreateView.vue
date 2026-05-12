<script setup lang="ts">
// Unified hunt create surface. 3 modes:
//  - structured  — Actors × Assets wizard (default)
//  - ttp         — TTP-seed materialize → graph view
//  - guess       — Guess threat actor by selected TTPs (uses global
//                  TTP picker drawer)
//
// Mode is URL-driven (?mode=guess) so deep links survive + sharing
// works ('here, take this guess-actor view').

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import HuntStructuredPanel from '@/components/hunts/HuntStructuredPanel.vue';
import HuntTtpSeedPanel from '@/components/hunts/HuntTtpSeedPanel.vue';
import HuntGuessActorPanel from '@/components/hunts/HuntGuessActorPanel.vue';

type Mode = 'structured' | 'ttp' | 'guess';
const VALID_MODES: Mode[] = ['structured', 'ttp', 'guess'];

const route = useRoute();
const router = useRouter();

const mode = computed<Mode>(() => {
  const m = route.query.mode as string | undefined;
  return VALID_MODES.includes(m as Mode) ? (m as Mode) : 'structured';
});

function setMode(m: Mode): void {
  router.replace({ path: '/hunts/new', query: { ...route.query, mode: m === 'structured' ? undefined : m } });
}

const TABS: { id: Mode; label: string; hint: string }[] = [
  { id: 'structured', label: 'Structured',   hint: 'Actors × Assets wizard' },
  { id: 'ttp',        label: 'TTP-seed',     hint: 'Materialize a graph from one MITRE technique' },
  { id: 'guess',      label: 'Guess actor',  hint: 'Reverse search — pick TTPs, get ranked actors' },
];
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'hunts', to: '/hunts' },
          { label: 'new', mono: false },
        ]"
        class="mb-3"
      />
      <h1 class="text-[26px] font-medium tracking-tight text-ink">New hunt</h1>
      <p class="mt-2 text-[12px] text-ink-faint">Pick a starting point. All three converge to the same Hunt entity.</p>

      <!-- Tab nav -->
      <nav class="mt-6 flex items-center gap-1 border-b border-rule -mb-[1px]">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          @click="setMode(t.id)"
          :class="[
            'px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider border-b-2 transition',
            mode === t.id
              ? 'border-signal text-ink'
              : 'border-transparent text-ink-faint hover:text-ink-dim hover:border-rule-strong',
          ]"
          :title="t.hint"
        >{{ t.label }}</button>
      </nav>
    </header>

    <HuntStructuredPanel v-if="mode === 'structured'" />
    <HuntTtpSeedPanel    v-else-if="mode === 'ttp'" />
    <HuntGuessActorPanel v-else-if="mode === 'guess'" />
  </div>
</template>
