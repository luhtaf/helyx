<script setup lang="ts">
defineProps<{
  id: string;
  name: string;
  isSubtechnique: boolean;
}>();
</script>

<template>
  <RouterLink
    :to="`/techniques/${id}`"
    :class="[
      'block rounded-[2px] border border-transparent px-2 py-1.5 transition hover:bg-surface hover:text-ink',
      isSubtechnique ? 'pl-4 opacity-90' : '',
    ]"
  >
    <p class="font-mono text-[10px] text-ink-faint tabular-nums">{{ id }}</p>
    <p class="text-[11px] text-ink-dim line-clamp-1">{{ name }}</p>
  </RouterLink>
</template>
