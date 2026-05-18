<script setup lang="ts">
import Sidebar from './Sidebar.vue';
import InboxBell from './InboxBell.vue';
import TtpPickerLauncher from '@/components/ttp-picker/TtpPickerLauncher.vue';
import TtpPickerDrawer from '@/components/ttp-picker/TtpPickerDrawer.vue';
</script>

<template>
  <div class="flex h-screen w-full bg-base text-ink relative z-10">
    <Sidebar />
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
    <InboxBell />
    <TtpPickerLauncher />
    <TtpPickerDrawer />
  </div>
</template>
