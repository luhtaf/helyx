<script setup lang="ts">
const props = defineProps<{
  severity?: string | null;
  size?: 'xs' | 'sm';
}>();

const colorClass: Record<string, string> = {
  CRITICAL: 'text-sev-crit',
  HIGH:     'text-sev-high',
  MEDIUM:   'text-sev-med',
  LOW:      'text-sev-low',
  NONE:     'text-sev-none',
};

const key = (props.severity ?? 'NONE').toUpperCase();
const cls = colorClass[key] ?? colorClass.NONE;
const label = (props.severity ?? 'unrated').toLowerCase();
const sizeCls = (props.size ?? 'xs') === 'sm' ? 'text-[11px]' : 'text-[10px]';
</script>

<template>
  <span :class="['font-mono uppercase tracking-wider', sizeCls, cls]">{{ label }}</span>
</template>
