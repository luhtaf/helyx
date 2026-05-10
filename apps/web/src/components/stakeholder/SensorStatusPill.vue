<script setup lang="ts">
import { SENSOR_STATUS_COLORS, SENSOR_STATUS_LABELS, type SensorStatus } from '@/composables/stakeholder-kinds';
defineProps<{ status: SensorStatus | null }>();
</script>

<template>
  <span
    v-if="status"
    :class="['inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', SENSOR_STATUS_COLORS[status]]"
  >
    <span class="inline-block w-1 h-1 rounded-full bg-current" />
    {{ SENSOR_STATUS_LABELS[status] }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">no sensor</span>
</template>
