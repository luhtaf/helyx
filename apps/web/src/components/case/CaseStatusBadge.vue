<script setup lang="ts">
import type { CaseStatus } from '@/composables/useCases';
defineProps<{ status: CaseStatus }>();

// ACTIVE uses signal (operational state, not severity) — autoplan #20 fix.
// sev-* colors reserved for verdict semantics.
const colorMap: Record<CaseStatus, string> = {
  DRAFT: 'bg-ink-faint/15 text-ink-dim border-ink-faint/30',
  ACTIVE: 'bg-signal/15 text-signal border-signal/30',
  CLOSED: 'bg-sev-low/15 text-sev-low border-sev-low/30',
  ARCHIVED: 'bg-ink-faint/10 text-ink-faint border-ink-faint/20',
};
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', colorMap[status]]">
    {{ status.toLowerCase() }}
  </span>
</template>
