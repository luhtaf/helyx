<script setup lang="ts">
import type { StakeholderSuggestion } from '@/composables/useReconciliationInbox';
import { MATCH_REASON_LABELS } from '@/composables/reconciliation-kinds';

defineProps<{ suggestions: StakeholderSuggestion[] }>();
</script>

<template>
  <div v-if="suggestions.length === 0" class="text-[12px] text-ink-faint italic font-mono">
    no suggestions — press N to create new, S to skip
  </div>
  <ol v-else class="space-y-1.5">
    <li v-for="(s, i) in suggestions.slice(0, 3)" :key="s.stakeholder.id" class="flex items-baseline justify-between gap-3">
      <div class="flex items-baseline gap-3 min-w-0">
        <span class="font-mono text-[11px] text-signal w-4">{{ i + 1 }}</span>
        <span class="text-ink truncate">{{ s.stakeholder.name }}</span>
        <span v-if="s.stakeholder.sektor" class="font-mono text-[10px] text-ink-faint">/ {{ s.stakeholder.sektor.slug }}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <div class="h-1 w-16 bg-rule rounded-[1px] overflow-hidden">
          <div class="h-full bg-signal/50" :style="{ width: (s.confidence * 100) + '%' }" />
        </div>
        <span class="font-mono text-[10px] text-ink-dim tabular-nums">{{ Math.round(s.confidence * 100) }}%</span>
        <span class="font-mono text-[9px] uppercase tracking-wider text-ink-faint border border-rule-strong px-1.5 py-0.5 rounded-sm">
          {{ MATCH_REASON_LABELS[s.reason] }}
        </span>
      </div>
    </li>
  </ol>
</template>
