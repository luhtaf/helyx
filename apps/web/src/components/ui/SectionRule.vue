<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    spacingTop?: 'lg' | 'md' | 'sm';
  }>(),
  { spacingTop: 'lg' },
);

const topClass: Record<string, string> = {
  lg: 'mt-14',
  md: 'mt-10',
  sm: 'mt-6',
};
</script>

<template>
  <header :class="['flex items-center gap-3 mb-6', topClass[spacingTop]]">
    <hr class="w-12 border-t border-rule-strong" />
    <span
      v-if="label"
      class="font-mono text-[10px] uppercase tracking-[0.18em] text-ink"
    >{{ label }}</span>
    <hr class="grow border-t border-rule" />
    <span
      v-if="$slots.right"
      class="font-mono text-[10px] uppercase tracking-wider text-ink-faint"
    >
      <slot name="right" />
    </span>
  </header>
</template>
