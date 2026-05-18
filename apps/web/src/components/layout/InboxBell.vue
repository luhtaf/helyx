<script setup lang="ts">
// Top-right notification bell — unified entry for the two operator
// review queues (replaces their sidebar links; better UX per owner).
// Combined pending badge; click opens a small panel with per-queue
// counts + deep links. Refetches on open + on tab refocus so the
// badge doesn't go stale while parked.

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useInboxBell } from '@/composables/useInboxBell';

const router = useRouter();
const {
  visible, canRecon, canInventory,
  reconPending, inventoryPending, total, refetch,
} = useInboxBell();

const open = ref(false);
function toggle(): void {
  open.value = !open.value;
  if (open.value) refetch();
}
function go(to: string): void {
  open.value = false;
  void router.push(to);
}
function cap(n: number): string {
  return n > 50 ? '50+' : String(n);
}

function onDocClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest('[data-inbox-bell]');
  if (!el) open.value = false;
}
function onVis(): void {
  if (document.visibilityState === 'visible') refetch();
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('visibilitychange', onVis);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('visibilitychange', onVis);
});
</script>

<template>
  <div v-if="visible" data-inbox-bell class="fixed top-4 right-4 z-40 pointer-events-auto">
    <button
      type="button"
      class="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-base border border-rule-strong shadow-lg hover:border-signal hover:text-signal text-ink-dim transition"
      :title="`${total} pending review${total === 1 ? '' : 's'}`"
      @click="toggle"
    >
      <span class="text-[15px] leading-none">⊙</span>
      <span
        v-if="total > 0"
        class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-signal text-base text-[10px] tabular-nums font-mono"
      >{{ cap(total) }}</span>
    </button>

    <Transition
      enter-active-class="transition duration-120 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute right-0 mt-2 w-[300px] bg-base border border-rule-strong rounded-md shadow-2xl overflow-hidden"
      >
        <p class="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule">
          review queues
        </p>

        <button
          v-if="canRecon"
          type="button"
          class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface transition border-b border-rule"
          @click="go('/admin/stakeholders/inbox')"
        >
          <span class="text-[13px] text-ink">Stakeholder reconciliation</span>
          <span
            :class="[
              'font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-sm',
              reconPending > 0 ? 'bg-signal/15 text-signal' : 'text-ink-faint',
            ]"
          >{{ cap(reconPending) }}</span>
        </button>

        <button
          v-if="canInventory"
          type="button"
          class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface transition"
          @click="go('/admin/inventory-inbox')"
        >
          <span class="text-[13px] text-ink">Inventory inbox</span>
          <span
            :class="[
              'font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-sm',
              inventoryPending > 0 ? 'bg-signal/15 text-signal' : 'text-ink-faint',
            ]"
          >{{ cap(inventoryPending) }}</span>
        </button>

        <p v-if="total === 0" class="px-4 py-3 font-mono text-[11px] text-ink-faint italic border-t border-rule">
          nothing pending — all clear.
        </p>
      </div>
    </Transition>
  </div>
</template>
