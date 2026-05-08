<script setup lang="ts">
import type { RawStakeholder } from '@/composables/useReconciliationInbox';
import SuggestionList from './SuggestionList.vue';

defineProps<{ raw: RawStakeholder; isFocused: boolean }>();
</script>

<template>
  <article
    :class="[
      'border-l-2 pl-5 pr-4 py-4 transition',
      isFocused
        ? 'border-signal bg-surface'
        : 'border-rule hover:border-rule-strong hover:bg-surface/40',
    ]"
  >
    <header class="flex items-baseline justify-between gap-4 mb-3">
      <h3 class="text-ink text-[15px] font-medium">{{ raw.rawName }}</h3>
      <div class="flex items-baseline gap-4 font-mono text-[10px] text-ink-faint shrink-0">
        <span>sektor: <span class="text-ink-dim">{{ raw.rawSektor ?? '—' }}</span></span>
        <span class="tabular-nums">hits: <span class="text-ink-dim">{{ raw.hitCount.toLocaleString() }}</span></span>
        <span class="tabular-nums">targets: <span class="text-ink-dim">{{ raw.targetCount }}</span></span>
        <span>seen: <span class="text-ink-dim">{{ raw.lastSeen.slice(0, 10) }}</span></span>
      </div>
    </header>

    <SuggestionList :suggestions="raw.suggestions" />

    <footer
      v-if="isFocused"
      class="mt-4 pt-3 border-t border-rule-strong flex items-center gap-4 font-mono text-[10px] text-ink-faint flex-wrap"
    >
      <span class="text-ink-dim">action keys:</span>
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">1-3</kbd> pick suggestion
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">N</kbd> create new
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-ink-dim">S</kbd> skip
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-ink-dim">X</kbd> reject
    </footer>
  </article>
</template>
