<script setup lang="ts">
// Add a single IOC artifact to a case. Operator workflow: during
// triage, add an IP/domain/hash they just spotted. Bulk-paste covers
// pasting many at once; this is the 1-at-a-time form.
//
// Backend createIocArtifact accepts:
//   base: { observedAt!, severity!, confidence!, notes?, tags?, hostAssetId? }
//   iocType! (IP/DOMAIN/URL/EMAIL/HASH), value!
//   direction?, firstSeen?, lastSeen?, source?

import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import {
  IOC_TYPES, IOC_TYPE_LABELS, DIRECTIONS,
  SEVERITIES, CONFIDENCES,
  type IocType, type Direction, type Severity, type Confidence,
} from '@/composables/artifact-kinds';
import type { IocArtifactInput } from '@/composables/useArtifacts';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', input: IocArtifactInput): void;
  (e: 'cancel'): void;
}>();

const iocType = ref<IocType>('IP');
const value = ref('');
const direction = ref<Direction | ''>('');
const source = ref('');
const severity = ref<Severity>('MEDIUM');
const confidence = ref<Confidence>('MEDIUM');
const notes = ref('');
const tagsRaw = ref('');
const observedAt = ref(''); // YYYY-MM-DDTHH:MM (datetime-local)

function reset(): void {
  iocType.value = 'IP';
  value.value = '';
  direction.value = '';
  source.value = '';
  severity.value = 'MEDIUM';
  confidence.value = 'MEDIUM';
  notes.value = '';
  tagsRaw.value = '';
  // default observedAt to now (local time, datetime-local format)
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  observedAt.value = d.toISOString().slice(0, 16);
}

watch(() => props.open, (isOpen) => { if (isOpen) reset(); });

function onKey(e: KeyboardEvent): void {
  if (!props.open) return;
  if (e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const canSubmit = computed(() => Boolean(value.value.trim() && observedAt.value));

function onSubmit(): void {
  if (!canSubmit.value) return;
  const tags = tagsRaw.value
    .split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  const input: IocArtifactInput = {
    base: {
      // datetime-local is local time; backend wants ISO Z. Append Z;
      // close-enough for operator audit, exact UTC not load-bearing.
      observedAt: `${observedAt.value}:00.000Z`,
      severity: severity.value,
      confidence: confidence.value,
      notes: notes.value.trim() || null,
      tags: tags.length > 0 ? tags : null,
    },
    iocType: iocType.value,
    value: value.value.trim(),
    direction: direction.value || null,
    source: source.value.trim() || null,
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
          class="w-[520px] max-h-[90vh] overflow-y-auto bg-base border border-rule-strong rounded-md shadow-2xl p-6"
          @click.stop
        >
          <header class="mb-4">
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">case · indicator</p>
            <h3 class="text-[16px] text-ink">Add IOC artifact</h3>
          </header>

          <div class="space-y-4">
            <!-- Type + value -->
            <div class="grid grid-cols-12 gap-3">
              <div class="col-span-3">
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">type <span class="text-sev-crit">*</span></label>
                <select
                  v-model="iocType"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option v-for="t in IOC_TYPES" :key="t" :value="t">{{ IOC_TYPE_LABELS[t] }}</option>
                </select>
              </div>
              <div class="col-span-9">
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">value <span class="text-sev-crit">*</span></label>
                <input
                  v-model="value"
                  type="text"
                  placeholder="e.g. 185.220.101.50 or evil.example.com"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
                />
              </div>
            </div>

            <!-- Direction + source -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">direction</label>
                <select
                  v-model="direction"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option value="">—</option>
                  <option v-for="d in DIRECTIONS" :key="d" :value="d">{{ d.toLowerCase() }}</option>
                </select>
              </div>
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">source</label>
                <input
                  v-model="source"
                  type="text"
                  placeholder="operator, wazuh, otx…"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>
            </div>

            <!-- Severity + confidence + observedAt -->
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">severity <span class="text-sev-crit">*</span></label>
                <select
                  v-model="severity"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s.toLowerCase() }}</option>
                </select>
              </div>
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">confidence <span class="text-sev-crit">*</span></label>
                <select
                  v-model="confidence"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option v-for="c in CONFIDENCES" :key="c" :value="c">{{ c.toLowerCase() }}</option>
                </select>
              </div>
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">observed at <span class="text-sev-crit">*</span></label>
                <input
                  v-model="observedAt"
                  type="datetime-local"
                  class="w-full px-2 py-1.5 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>
            </div>

            <!-- Tags -->
            <div>
              <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">tags</label>
              <input
                v-model="tagsRaw"
                type="text"
                placeholder="comma-separated — c2, ransomware, garuda"
                class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
              />
            </div>

            <!-- Notes -->
            <div>
              <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">notes</label>
              <textarea
                v-model="notes"
                placeholder="free-form context — where you spotted it, why it matters"
                class="w-full min-h-[64px] px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition resize-y"
              />
            </div>
          </div>

          <footer class="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
            <Button variant="primary" size="sm" :loading="loading" :disabled="!canSubmit" @click="onSubmit">Add IOC</Button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
