<script setup lang="ts">
import { useToast } from '@/composables/useToast';
const { message, variant } = useToast();

const variantClass: Record<string, string> = {
  info: 'border-rule-strong text-ink',
  success: 'border-sev-low/40 text-sev-low',
  error: 'border-sev-crit/40 text-sev-crit',
};
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-150"
    leave-to-class="opacity-0"
  >
    <div
      v-if="message"
      :class="['fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md bg-surface border font-mono text-[12px] z-50', variantClass[variant]]"
    >
      {{ message }}
    </div>
  </Transition>
</template>
