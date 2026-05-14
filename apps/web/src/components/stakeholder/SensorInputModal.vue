<script setup lang="ts">
// Per-stakeholder sensor input modal.
//
// Backend setStakeholderSensor accepts {stack, status, agentCount,
// deployedAt, notes}; all optional. Operator workflow: register or
// update which sensor stack a stakeholder has + counts + status.
//
// Existing SensorStatusPill is read-only; this modal turns it
// editable. ANALYST+ can mutate.

import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  SENSOR_STACKS, SENSOR_STATUSES, SENSOR_STACK_LABELS,
  SENSOR_STATUS_LABELS, type SensorStack, type SensorStatus,
} from '@/composables/stakeholder-kinds';
import type { SensorInput } from '@/composables/useStakeholders';
import Button from '@/components/ui/Button.vue';

interface Existing {
  stack?: SensorStack | null;
  status?: SensorStatus | null;
  agentCount?: number | null;
  deployedAt?: string | null;
  notes?: string | null;
}

const props = defineProps<{
  open: boolean;
  loading: boolean;
  /** Pre-fill from existing sensor (edit mode); null = fresh. */
  existing?: Existing | null;
}>();

const emit = defineEmits<{
  (e: 'submit', input: SensorInput): void;
  (e: 'cancel'): void;
}>();

const stack = ref<SensorStack | ''>('');
const status = ref<SensorStatus | ''>('');
const agentCount = ref<string>('');
const deployedAt = ref<string>('');
const notes = ref<string>('');

function load(): void {
  stack.value = props.existing?.stack ?? '';
  status.value = props.existing?.status ?? '';
  agentCount.value = props.existing?.agentCount != null ? String(props.existing.agentCount) : '';
  // setStakeholderSensor takes ISO strings; date input wants YYYY-MM-DD.
  deployedAt.value = props.existing?.deployedAt
    ? props.existing.deployedAt.slice(0, 10)
    : '';
  notes.value = props.existing?.notes ?? '';
}

watch(() => props.open, (isOpen) => { if (isOpen) load(); });

function onKey(e: KeyboardEvent): void {
  if (!props.open) return;
  if (e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function onSubmit(): void {
  const ac = agentCount.value.trim();
  const input: SensorInput = {
    stack: stack.value || null,
    status: status.value || null,
    agentCount: ac ? Math.max(0, Math.floor(Number(ac))) : null,
    deployedAt: deployedAt.value ? `${deployedAt.value}T00:00:00.000Z` : null,
    notes: notes.value.trim() || null,
  };
  emit('submit', input);
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] bg-base/70 backdrop-blur-sm flex items-center justify-center px-4"
        @click="emit('cancel')"
      >
        <div
          class="w-[460px] bg-base border border-rule-strong rounded-md shadow-2xl p-6"
          @click.stop
        >
          <header class="mb-4">
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">stakeholder sensor</p>
            <h3 class="text-[16px] text-ink">Configure sensor coverage</h3>
          </header>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">stack</label>
                <select
                  v-model="stack"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option value="">—</option>
                  <option v-for="s in SENSOR_STACKS" :key="s" :value="s">{{ SENSOR_STACK_LABELS[s] }}</option>
                </select>
              </div>
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">status</label>
                <select
                  v-model="status"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option value="">—</option>
                  <option v-for="s in SENSOR_STATUSES" :key="s" :value="s">{{ SENSOR_STATUS_LABELS[s] }}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">agents</label>
                <input
                  v-model="agentCount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 12"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">deployed at</label>
                <input
                  v-model="deployedAt"
                  type="date"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>
            </div>

            <div>
              <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">notes</label>
              <textarea
                v-model="notes"
                placeholder="optional — deployment context, partner agency, etc."
                class="w-full min-h-[64px] px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition resize-y"
              />
            </div>
          </div>

          <footer class="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
            <Button variant="primary" size="sm" :loading="loading" @click="onSubmit">Save sensor</Button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
