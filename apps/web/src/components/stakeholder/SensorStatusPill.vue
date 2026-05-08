<script setup lang="ts">
defineProps<{ status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | null }>();

const colorMap: Record<string, string> = {
  ONLINE: 'bg-sev-low/15 text-sev-low border-sev-low/30',
  DEGRADED: 'bg-sev-med/15 text-sev-med border-sev-med/30',
  OFFLINE: 'bg-sev-crit/15 text-sev-crit border-sev-crit/30',
};

const labelMap: Record<string, string> = {
  ONLINE: 'online',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
};
</script>

<template>
  <span
    v-if="status"
    :class="['inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', colorMap[status]]"
  >
    <span class="inline-block w-1 h-1 rounded-full bg-current" />
    {{ labelMap[status] }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">no sensor</span>
</template>
