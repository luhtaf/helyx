<script setup lang="ts">
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">404</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight">Not found</h1>
    </header>
    <p class="text-[13px] text-ink-dim">
      no route matches
      <span class="font-mono text-ink-faint mx-1">{{ route.fullPath }}</span>
      —
      <RouterLink to="/" class="text-ink hover:text-signal transition">return to overview</RouterLink>
    </p>
  </div>
</template>
