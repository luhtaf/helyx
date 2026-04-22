<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    none?: number;
    height?: string;
  }>(),
  { critical: 0, high: 0, medium: 0, low: 0, none: 0, height: '6px' },
);

const total = computed(() =>
  (props.critical ?? 0) + (props.high ?? 0) + (props.medium ?? 0) + (props.low ?? 0) + (props.none ?? 0),
);

const segments = computed(() => [
  { value: props.critical, color: 'var(--sev-crit)', key: 'crit' },
  { value: props.high,     color: 'var(--sev-high)', key: 'high' },
  { value: props.medium,   color: 'var(--sev-med)',  key: 'med'  },
  { value: props.low,      color: 'var(--sev-low)',  key: 'low'  },
  { value: props.none,     color: 'var(--sev-none)', key: 'none' },
].filter((s) => s.value > 0));
</script>

<template>
  <div
    class="flex w-full overflow-hidden rounded-[1px] bg-rule"
    :style="{ height }"
    :aria-label="`${total} items by severity`"
  >
    <div
      v-for="seg in segments"
      :key="seg.key"
      :style="{ flexGrow: seg.value, background: seg.color }"
      class="transition-[flex-grow] duration-300"
    />
  </div>
</template>
