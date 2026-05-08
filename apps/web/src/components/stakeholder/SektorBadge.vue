<script setup lang="ts">
import { useRouter } from 'vue-router';

defineProps<{ sektor: { slug: string; name: string } | null; clickable?: boolean }>();

const router = useRouter();

function navigate(slug: string): void {
  router.push({ path: '/stakeholders', query: { sektor: slug } });
}
</script>

<template>
  <button
    v-if="sektor && clickable"
    type="button"
    class="inline-flex items-center px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim hover:text-ink hover:border-ink-faint transition font-mono text-[10px] uppercase tracking-wider"
    @click.stop="navigate(sektor.slug)"
  >
    {{ sektor.name }}
  </button>
  <span
    v-else-if="sektor"
    class="inline-flex items-center px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim font-mono text-[10px] uppercase tracking-wider"
  >
    {{ sektor.name }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">unsektored</span>
</template>
