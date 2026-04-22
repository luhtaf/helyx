<script setup lang="ts">
import Sidebar from './Sidebar.vue';
</script>

<template>
  <div class="flex h-screen w-full bg-base text-ink relative z-10">
    <Sidebar />
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
