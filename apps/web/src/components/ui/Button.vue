<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit';
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', loading: false, disabled: false, block: false },
);

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-px';

const variantClass: Record<string, string> = {
  primary:
    'bg-signal text-base shadow-[0_1px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-ink hover:shadow-[0_2px_8px_rgba(200,176,122,0.25),inset_0_1px_0_rgba(255,255,255,0.25)]',
  secondary:
    'border border-ink-faint/60 bg-surface text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-ink-dim hover:bg-surface/70 hover:text-ink',
  ghost:
    'border border-rule text-ink-dim hover:border-ink-faint hover:bg-surface hover:text-ink',
  danger:
    'border border-sev-crit/40 bg-sev-crit/10 text-sev-crit hover:bg-sev-crit/20 hover:border-sev-crit/70',
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
