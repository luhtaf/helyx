<script setup lang="ts">
import { CASE_STATUS_COLORS, type CaseStatus } from '@/composables/case-kinds';
defineProps<{ status: CaseStatus }>();
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', CASE_STATUS_COLORS[status]]">
    {{ status.toLowerCase() }}
  </span>
</template>
