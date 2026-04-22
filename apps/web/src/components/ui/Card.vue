<script setup lang="ts">
defineProps<{
  title?: string;
  eyebrow?: string;
}>();
</script>

<template>
  <section class="rounded-xl border border-neutral-800/80 bg-neutral-900/40">
    <header v-if="title || eyebrow || $slots.header" class="border-b border-neutral-800/60 px-6 py-4">
      <slot name="header">
        <p
          v-if="eyebrow"
          class="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500"
        >
          {{ eyebrow }}
        </p>
        <h2 v-if="title" class="text-base font-medium tracking-tight text-neutral-100">
          {{ title }}
        </h2>
      </slot>
    </header>
    <div :class="$slots.header || title || eyebrow ? 'p-6' : 'p-6'">
      <slot />
    </div>
  </section>
</template>
