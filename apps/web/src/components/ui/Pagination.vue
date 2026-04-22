<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  perPage: number;
  total: number;
}>();

const emit = defineEmits<{ (e: 'update:page', page: number): void }>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)));
const start = computed(() => (props.page - 1) * props.perPage + 1);
const end = computed(() => Math.min(props.page * props.perPage, props.total));

function go(target: number): void {
  const next = Math.min(Math.max(1, target), totalPages.value);
  if (next !== props.page) emit('update:page', next);
}
</script>

<template>
  <div
    v-if="total > 0"
    class="flex items-center justify-between font-mono text-[11px] text-ink-faint"
  >
    <span>
      <span class="text-ink-dim tabular-nums">{{ start }}</span>
      –<span class="text-ink-dim tabular-nums">{{ end }}</span>
      of <span class="text-ink tabular-nums">{{ total }}</span>
    </span>

    <nav class="flex items-center gap-3">
      <button
        type="button"
        :disabled="page <= 1"
        :class="['transition', page <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-ink']"
        @click="go(page - 1)"
      >‹ prev</button>

      <span class="text-ink-dim">
        page <span class="text-ink tabular-nums">{{ page }}</span>
        / <span class="tabular-nums">{{ totalPages }}</span>
      </span>

      <button
        type="button"
        :disabled="page >= totalPages"
        :class="['transition', page >= totalPages ? 'opacity-30 cursor-not-allowed' : 'hover:text-ink']"
        @click="go(page + 1)"
      >next ›</button>
    </nav>
  </div>
</template>
