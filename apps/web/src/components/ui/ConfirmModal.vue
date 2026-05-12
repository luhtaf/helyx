<script setup lang="ts">
// Global confirm modal. Mounted once in App.vue. Reads singleton state
// from useConfirm composable — when pending is non-null, render the
// modal. Esc + backdrop click = cancel; Enter = accept (focus default).

import { computed, onMounted, onBeforeUnmount, watch, nextTick, ref } from 'vue';
import { useConfirm } from '@/composables/useConfirm';
import Button from '@/components/ui/Button.vue';

const { pending, accept, reject } = useConfirm();
const open = computed(() => pending.value !== null);
const confirmBtn = ref<InstanceType<typeof Button> | null>(null);

const variant = computed(() => pending.value?.variant ?? 'default');
const confirmLabel = computed(() => pending.value?.confirmLabel ?? 'Confirm');
const cancelLabel = computed(() => pending.value?.cancelLabel ?? 'Cancel');

function onKey(e: KeyboardEvent): void {
  if (!open.value) return;
  if (e.key === 'Escape') { e.preventDefault(); reject(); }
  // Enter on default button — guard so typing in inputs (none in modal
  // currently, but future-proof) doesn't auto-confirm.
  if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'INPUT' && (e.target as HTMLElement | null)?.tagName !== 'TEXTAREA') {
    e.preventDefault();
    accept();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// Auto-focus the confirm button so Enter works without a click first.
watch(open, async (now) => {
  if (now) {
    await nextTick();
    const el = (confirmBtn.value?.$el ?? confirmBtn.value) as HTMLElement | null;
    el?.focus?.();
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && pending"
        class="fixed inset-0 z-[60] bg-base/70 backdrop-blur-sm flex items-center justify-center px-4"
        @click="reject"
      >
        <div
          class="w-[440px] bg-base border border-rule-strong rounded-md shadow-2xl p-6"
          @click.stop
          role="dialog"
          aria-modal="true"
          :aria-labelledby="'confirm-title'"
        >
          <h3 id="confirm-title" class="text-[16px] text-ink mb-2">{{ pending.title }}</h3>
          <p v-if="pending.message" class="text-[12px] text-ink-dim mb-5 leading-relaxed">{{ pending.message }}</p>
          <div class="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" @click="reject">{{ cancelLabel }}</Button>
            <Button
              ref="confirmBtn"
              :variant="variant === 'danger' ? 'primary' : 'primary'"
              size="sm"
              :class="variant === 'danger' ? '!bg-sev-crit !text-base hover:!bg-sev-crit/90' : ''"
              @click="accept"
            >{{ confirmLabel }}</Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
