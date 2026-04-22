<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

export interface Crumb {
  label: string;
  to?: RouteLocationRaw;
  mono?: boolean;
}

defineProps<{ crumbs: Crumb[] }>();
</script>

<template>
  <nav class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em]">
    <template v-for="(crumb, i) in crumbs" :key="i">
      <span v-if="i > 0" class="text-ink-faint">/</span>
      <RouterLink
        v-if="crumb.to && i < crumbs.length - 1"
        :to="crumb.to"
        :class="['text-ink-dim hover:text-ink transition', crumb.mono ? 'normal-case tracking-normal' : '']"
      >{{ crumb.label }}</RouterLink>
      <span
        v-else
        :class="['text-ink-faint', crumb.mono ? 'normal-case tracking-normal' : '']"
      >{{ crumb.label }}</span>
    </template>
  </nav>
</template>
