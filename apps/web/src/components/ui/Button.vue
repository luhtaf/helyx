<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit';
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', loading: false, disabled: false, block: false },
);

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300/30 disabled:cursor-not-allowed disabled:opacity-50';

const variantClass: Record<string, string> = {
  primary: 'bg-neutral-100 text-neutral-950 hover:bg-white',
  secondary: 'border border-neutral-700/80 bg-neutral-900 text-neutral-100 hover:bg-neutral-800',
  ghost: 'text-neutral-300 hover:bg-neutral-800/60',
};

const sizeClass: Record<string, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
};
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[baseClass, variantClass[variant], sizeClass[size], block && 'w-full']"
  >
    <span
      v-if="loading"
      class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
    <slot />
  </button>
</template>
