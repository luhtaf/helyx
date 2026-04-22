<script setup lang="ts">
defineProps<{
  label: string;
  state?: 'ok' | 'down' | 'pending';
}>();

const dotClass: Record<NonNullable<'ok' | 'down' | 'pending'>, string> = {
  ok: 'bg-emerald-400',
  down: 'bg-red-400',
  pending: 'bg-neutral-600 animate-pulse',
};

const labelClass: Record<NonNullable<'ok' | 'down' | 'pending'>, string> = {
  ok: 'text-emerald-300',
  down: 'text-red-300',
  pending: 'text-neutral-400',
};
</script>

<template>
  <div class="flex items-center justify-between py-3 text-sm">
    <dt class="text-neutral-400">{{ label }}</dt>
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
