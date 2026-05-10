<script setup lang="ts">
import { CASE_VERDICT_COLORS, CASE_VERDICT_LABELS, type CaseVerdict } from '@/composables/case-kinds';
defineProps<{ verdict: CaseVerdict | null }>();
</script>

<template>
  <span
    v-if="verdict"
    :class="['inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', CASE_VERDICT_COLORS[verdict]]"
  >
    {{ CASE_VERDICT_LABELS[verdict] }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">—</span>
</template>
