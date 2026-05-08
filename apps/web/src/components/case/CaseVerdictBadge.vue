<script setup lang="ts">
import type { CaseVerdict } from '@/composables/useCases';
defineProps<{ verdict: CaseVerdict | null }>();

const colorMap: Record<CaseVerdict, string> = {
  CONFIRMED: 'bg-sev-crit/15 text-sev-crit border-sev-crit/30',
  INCONCLUSIVE: 'bg-sev-med/15 text-sev-med border-sev-med/30',
  CLEAN: 'bg-sev-low/15 text-sev-low border-sev-low/30',
  PENDING: 'bg-ink-faint/15 text-ink-dim border-ink-faint/30',
};

const labelMap: Record<CaseVerdict, string> = {
  CONFIRMED: 'compromised',
  INCONCLUSIVE: 'inconclusive',
  CLEAN: 'clean',
  PENDING: 'pending',
};
</script>

<template>
  <span
    v-if="verdict"
    :class="['inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', colorMap[verdict]]"
  >
    {{ labelMap[verdict] }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">—</span>
</template>
