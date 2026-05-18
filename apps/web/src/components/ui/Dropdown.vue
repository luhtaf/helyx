<script setup lang="ts">
// Generic click-to-open dropdown. Trigger slot (or `label` prop) +
// panel slot. Closes on outside-click + Esc + route-intent. Pattern
// lifted from InboxBell so the app has one menu primitive (CLAUDE.md
// DRY mandate). Panel is absolutely positioned relative to wrapper;
// caller controls width via the panel slot's root class.

import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = withDefaults(
  defineProps<{ label?: string; align?: 'left' | 'right'; disabled?: boolean }>(),
  { align: 'right' },
);
const emit = defineEmits<{ (e: 'open'): void }>();

let _seq = 0;
const tag = `dd-${(_seq = (Math.random() * 1e9) | 0)}`;
const open = ref(false);

function toggle(): void {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) emit('open');
}
function close(): void {
  open.value = false;
}
function onDocClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest(`[data-dd="${tag}"]`);
  if (!el) open.value = false;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false;
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
});

defineExpose({ close });
</script>

<template>
  <div :data-dd="tag" class="relative inline-block">
    <slot name="trigger" :open="open" :toggle="toggle">
      <button
        type="button"
        :disabled="disabled"
        class="inline-flex items-center gap-1.5 bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-[12px] text-ink-dim hover:text-ink hover:border-signal/60 transition disabled:opacity-50"
        @click="toggle"
      >
        {{ label }}
        <span class="text-[9px] text-ink-faint transition" :class="open ? 'rotate-180' : ''">▾</span>
      </button>
    </slot>

    <Transition
      enter-active-class="transition duration-120 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute mt-2 z-50"
        :class="align === 'right' ? 'right-0' : 'left-0'"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>
