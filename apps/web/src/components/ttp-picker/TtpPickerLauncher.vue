<script setup lang="ts">
// Floating pill bottom-right. Visible across every authed page when
// AppShell is mounted. Click → opens the TtpPickerDrawer. Counter
// reflects the singleton selection so the operator can glance at it
// from anywhere and know how many TTPs are queued.

import { useTtpSelection } from '@/composables/useTtpSelection';

const ttp = useTtpSelection();
</script>

<template>
  <button
    type="button"
    @click="ttp.toggleOpen()"
    :title="ttp.count.value === 0 ? 'Open TTP picker' : `${ttp.count.value} TTPs selected — click to open picker`"
    class="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-base border border-rule-strong shadow-lg hover:border-signal hover:text-signal text-ink-dim font-mono text-[11px] transition pointer-events-auto"
  >
    <span class="text-[14px] leading-none">▤</span>
    <span class="uppercase tracking-wider text-[10px]">ttps</span>
    <span
      v-if="ttp.count.value > 0"
      class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-signal text-base text-[10px] tabular-nums"
    >{{ ttp.count.value }}</span>
  </button>
</template>
