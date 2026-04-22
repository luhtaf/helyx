<script setup lang="ts">
defineProps<{
  title?: string;
  eyebrow?: string;
}>();
</script>

<template>
  <section class="rounded-xl border border-rule bg-surface">
    <header v-if="title || eyebrow || $slots.header" class="border-b border-rule px-6 py-4">
      <slot name="header">
        <p
          v-if="eyebrow"
          class="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink-faint"
        >
          {{ eyebrow }}
        </p>
        <h2 v-if="title" class="text-base font-medium tracking-tight text-ink">
          {{ title }}
        </h2>
      </slot>
    </header>
    <div class="p-6">
      <slot />
    </div>
  </section>
</template>
