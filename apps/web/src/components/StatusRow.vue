<script setup lang="ts">
defineProps<{
  label: string;
  state?: 'ok' | 'down' | 'pending';
}>();

const dotClass: Record<NonNullable<'ok' | 'down' | 'pending'>, string> = {
  ok: 'bg-sev-low',
  down: 'bg-sev-crit',
  pending: 'bg-ink-faint animate-pulse',
};

const labelClass: Record<NonNullable<'ok' | 'down' | 'pending'>, string> = {
  ok: 'text-sev-low',
  down: 'text-sev-crit',
  pending: 'text-ink-dim',
};
</script>

<template>
  <div class="flex items-center justify-between py-3 text-sm">
    <dt class="text-ink-dim">{{ label }}</dt>
    <dd class="flex items-center gap-2">
      <slot>
        <span
          v-if="state"
          :class="['inline-block h-1.5 w-1.5 rounded-full', dotClass[state]]"
        />
        <span v-if="state" :class="['font-mono text-xs', labelClass[state]]">
          {{ state }}
        </span>
      </slot>
    </dd>
  </div>
</template>
