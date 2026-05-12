<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { GraphNode, Transform } from './graph-types';

const props = defineProps<{
  /** Page-coord position of the click. Component clamps to viewport. */
  x: number;
  y: number;
  node: GraphNode;
  transforms: Transform[];
}>();

const emit = defineEmits<{
  (e: 'pick', transform: Transform, limit?: number): void;
  (e: 'close'): void;
  (e: 'hide'): void;
  (e: 'pin'): void;
}>();

// Clamp menu so it doesn't render off-screen for nodes near right/bottom edges.
const styleObject = computed(() => {
  const MENU_W = 240;
  const MENU_H = 280;
  const left = Math.min(props.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(props.y, window.innerHeight - MENU_H - 8);
  return { left: `${left}px`, top: `${top}px` };
});

const applicable = computed(() =>
  props.transforms.filter((t) => t.appliesTo === props.node.type),
);

function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onEsc));
onUnmounted(() => window.removeEventListener('keydown', onEsc));
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop catches outside-clicks -->
    <div class="fixed inset-0 z-40" @click="emit('close')" />
    <div
      class="fixed z-50 w-[240px] bg-base border border-rule-strong rounded-md shadow-xl py-1 font-mono text-[12px]"
      :style="styleObject"
      @click.stop
    >
      <header class="px-3 py-2 border-b border-rule">
        <p class="text-[9px] uppercase tracking-wider text-ink-faint">{{ node.type }}</p>
        <p class="text-ink truncate mt-0.5">{{ node.label }}</p>
      </header>

      <p
        v-if="applicable.length === 0"
        class="px-3 py-2 text-ink-faint italic"
      >No transforms for this type.</p>

      <template v-for="t in applicable" :key="t.id">
        <!-- Without varyLimit: single click → fetch with default cap -->
        <button
          v-if="!t.varyLimit"
          type="button"
          class="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-surface hover:text-ink transition flex items-baseline justify-between gap-3"
          :title="t.description ?? ''"
          @click="emit('pick', t); emit('close')"
        >
          <span>{{ t.label }}</span>
          <span class="text-[9px] text-ink-faint shrink-0">≤{{ t.cap }}</span>
        </button>
        <!-- With varyLimit: label header + size buttons row, no auto-pick -->
        <div v-else class="px-3 py-1.5 text-ink-dim" :title="t.description ?? ''">
          <p class="text-[11px] text-ink-dim">{{ t.label }}</p>
          <div class="mt-1.5 flex items-center gap-1">
            <button
              v-for="n in t.varyLimit"
              :key="n"
              type="button"
              class="font-mono text-[10px] px-2 py-0.5 rounded-sm border border-rule text-ink-faint hover:border-signal hover:text-signal transition"
              @click="emit('pick', t, n); emit('close')"
            >{{ n }}</button>
            <button
              type="button"
              class="font-mono text-[10px] px-2 py-0.5 rounded-sm border border-rule text-ink-faint hover:border-signal hover:text-signal transition"
              :title="`fetch up to the cap (${t.cap})`"
              @click="emit('pick', t, t.cap); emit('close')"
            >all ≤{{ t.cap }}</button>
          </div>
        </div>
      </template>

      <div class="border-t border-rule mt-1 pt-1">
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-ink-faint hover:bg-surface hover:text-ink-dim transition"
          @click="emit('pin'); emit('close')"
        >Pin position (dbl-click)</button>
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-sev-crit/80 hover:bg-sev-crit/10 hover:text-sev-crit transition flex items-center justify-between"
          @click="emit('hide'); emit('close')"
        ><span>Remove from graph</span><span class="text-[9px] text-ink-faint">del</span></button>
      </div>
    </div>
  </Teleport>
</template>
