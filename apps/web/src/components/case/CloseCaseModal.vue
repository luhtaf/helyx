<script setup lang="ts">
import { ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import { CLOSE_VERDICTS, type CloseVerdict } from '@/composables/case-kinds';

defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', verdict: CloseVerdict): void;
  (e: 'cancel'): void;
}>();

const verdict = ref<CloseVerdict>('CONFIRMED');

const verdictMeta: Record<CloseVerdict, { label: string; color: string; help: string }> = {
  CONFIRMED: {
    label: 'Confirmed compromise',
    color: 'text-sev-crit',
    help: 'Evidence of active compromise found',
  },
  INCONCLUSIVE: {
    label: 'Inconclusive',
    color: 'text-sev-med',
    help: 'Evidence insufficient — neither confirms nor rules out',
  },
  CLEAN: {
    label: 'Clean',
    color: 'text-sev-low',
    help: 'No evidence of compromise',
  },
};
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-base/60 backdrop-blur-sm" @click="emit('cancel')" />
        <div class="relative bg-surface border border-rule-strong rounded-md p-8 w-[420px] z-10">
          <header class="mb-6">
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">close case</p>
            <h2 class="text-[18px] text-ink mt-1">Pick verdict</h2>
          </header>

          <div class="space-y-2 mb-6">
            <label
              v-for="v in CLOSE_VERDICTS"
              :key="v"
              :class="[
                'flex items-start gap-3 px-3 py-3 rounded-md border cursor-pointer transition',
                verdict === v ? 'border-signal bg-base' : 'border-rule hover:border-rule-strong',
              ]"
            >
              <input v-model="verdict" type="radio" :value="v" class="mt-1" />
              <div>
                <p :class="['font-medium text-[13px]', verdictMeta[v].color]">
                  {{ verdictMeta[v].label }}
                </p>
                <p class="text-[11px] text-ink-dim mt-0.5">{{ verdictMeta[v].help }}</p>
              </div>
            </label>
          </div>

          <div class="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              :loading="loading"
              @click="emit('submit', verdict)"
            >
              Close case as {{ verdict.toLowerCase() }}
            </Button>
            <Button type="button" variant="ghost" @click="emit('cancel')">Cancel</Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
