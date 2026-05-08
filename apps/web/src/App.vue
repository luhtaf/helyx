<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppShell from '@/components/layout/AppShell.vue';
import Toast from '@/components/ui/Toast.vue';

const auth = useAuthStore();
const route = useRoute();

const useShell = computed(() => auth.isAuthed && !route.meta.public);
</script>

<template>
  <AppShell v-if="useShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
  <Toast />
</template>
