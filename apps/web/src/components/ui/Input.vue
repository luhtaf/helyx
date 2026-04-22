<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    type?: 'text' | 'email' | 'password' | 'search';
    placeholder?: string;
    label?: string;
    autocomplete?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
  }>(),
  { type: 'text' },
);

defineEmits<{ (e: 'update:modelValue', value: string): void }>();
</script>

<template>
  <label class="block">
    <span
      v-if="label"
      class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint"
    >
      {{ label }}
    </span>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :disabled="disabled"
      class="block h-9 w-full rounded-md border border-rule bg-base px-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink-dim focus:outline-none focus:ring-1 focus:ring-ink-dim disabled:cursor-not-allowed disabled:opacity-50"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
