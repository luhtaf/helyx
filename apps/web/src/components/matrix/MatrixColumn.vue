<script setup lang="ts">
import { computed } from 'vue';
import TechniqueCard from '@/components/matrix/TechniqueCard.vue';
import type { MatrixColumn as MatrixColumnShape } from '@/composables/useMatrix';

const props = defineProps<{
  column: MatrixColumnShape;
  showSubtechniques: boolean;
}>();

const visibleTechniques = computed(() =>
  props.showSubtechniques
    ? props.column.techniques
    : props.column.techniques.filter((tech) => !tech.isSubtechnique),
);
</script>

<template>
  <section class="w-[180px] shrink-0 border-r border-rule">
    <header class="sticky top-0 z-10 border-b border-rule-strong bg-base/95 px-3 py-3 backdrop-blur-sm">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-[12px] font-medium text-ink">{{ column.tactic.name }}</h2>
        <span class="font-mono text-[10px] text-ink-faint tabular-nums">
          {{ visibleTechniques.length }}
        </span>
      </div>
    </header>

    <div class="max-h-[65vh] overflow-y-auto px-1.5 py-2">
      <TechniqueCard
        v-for="technique in visibleTechniques"
        :key="technique.id"
        :id="technique.id"
        :name="technique.name"
        :is-subtechnique="technique.isSubtechnique"
      />
    </div>
  </section>
</template>
