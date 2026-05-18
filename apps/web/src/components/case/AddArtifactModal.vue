<script setup lang="ts">
// Generic case-artifact create form — one modal for all 11 types.
// Type picker swaps the per-type field set from the artifact-forms SoT
// descriptor; base fields (observedAt/severity/confidence/host/notes/
// tags) are constant. No bespoke per-type components (DRY).
//
// Coercion at submit: datetime-local → ISO, number "" → omit, empty
// optional strings → omit, taglist → string[]. NOTE injects
// author = current user id (schema requires ID!), not a visible field.

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  ARTIFACT_TYPES, ARTIFACT_TYPE_LABELS, SEVERITIES, CONFIDENCES,
  type ArtifactType,
} from '@/composables/artifact-kinds';
import { ARTIFACT_FORM_SPECS, type FieldSpec } from '@/composables/artifact-forms';
import type { ArtifactBaseInput } from '@/composables/useArtifacts';
import { useAssetAutocomplete, type AssetAutocompleteHit } from '@/composables/useAssets';
import { useAuthStore } from '@/stores/auth';
import { useDebounceFn } from '@vueuse/core';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', payload: {
    type: ArtifactType;
    base: ArtifactBaseInput;
    fields: Record<string, unknown>;
  }): void;
  (e: 'cancel'): void;
}>();

const auth = useAuthStore();

const type = ref<ArtifactType>('IOC');
const spec = computed(() => ARTIFACT_FORM_SPECS[type.value]);

// Base
function nowLocal(): string {
  // datetime-local wants 'YYYY-MM-DDTHH:mm' in local time.
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const observedAt = ref(nowLocal());
const severity = ref<typeof SEVERITIES[number]>('MEDIUM');
const confidence = ref<typeof CONFIDENCES[number]>('MEDIUM');
const notes = ref('');
const tagsRaw = ref('');

// Host autocomplete (optional)
const hostSearch = ref('');
const hostHits = ref<AssetAutocompleteHit[]>([]);
const hostPicked = ref<AssetAutocompleteHit | null>(null);
const { search: searchAssets } = useAssetAutocomplete();
const runHostSearch = useDebounceFn(async (q: string) => {
  hostHits.value = q.trim().length >= 2 ? await searchAssets(q) : [];
}, 250);
watch(hostSearch, (q) => {
  if (hostPicked.value && q !== hostPicked.value.name) hostPicked.value = null;
  void runHostSearch(q);
});
function pickHost(h: AssetAutocompleteHit): void {
  hostPicked.value = h;
  hostSearch.value = h.name;
  hostHits.value = [];
}

// Per-type field values — keyed by field.key.
const fieldVals = ref<Record<string, string | boolean>>({});
function resetFields(): void {
  const v: Record<string, string | boolean> = {};
  for (const f of spec.value.fields) v[f.key] = f.kind === 'checkbox' ? false : '';
  fieldVals.value = v;
}
function resetAll(): void {
  type.value = 'IOC';
  observedAt.value = nowLocal();
  severity.value = 'MEDIUM';
  confidence.value = 'MEDIUM';
  notes.value = '';
  tagsRaw.value = '';
  hostSearch.value = '';
  hostPicked.value = null;
  hostHits.value = [];
  resetFields();
}
watch(() => props.open, (o) => { if (o) resetAll(); });
watch(type, () => resetFields());

function onKey(e: KeyboardEvent): void {
  if (props.open && e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// Required check: base observedAt + every required per-type field.
const missing = computed<string[]>(() => {
  const m: string[] = [];
  if (!observedAt.value) m.push('observed at');
  for (const f of spec.value.fields) {
    if (!f.required) continue;
    const val = fieldVals.value[f.key];
    if (f.kind === 'checkbox') continue; // boolean always valid
    if (typeof val !== 'string' || val.trim() === '') m.push(f.label.toLowerCase());
  }
  return m;
});

function toIso(local: string): string {
  // datetime-local (local time, no tz) → ISO 8601 UTC.
  return local ? new Date(local).toISOString() : '';
}
function splitList(raw: string): string[] {
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function onSubmit(): void {
  if (missing.value.length > 0) return;

  const tags = splitList(tagsRaw.value);
  const base: ArtifactBaseInput = {
    observedAt: toIso(observedAt.value),
    severity: severity.value,
    confidence: confidence.value,
    hostAssetId: hostPicked.value?.id ?? null,
    notes: notes.value.trim() || null,
    tags: tags.length > 0 ? tags : null,
  };

  const fields: Record<string, unknown> = {};
  for (const f of spec.value.fields) {
    const v = fieldVals.value[f.key];
    if (f.kind === 'checkbox') {
      fields[f.key] = Boolean(v);
      continue;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    if (s === '') continue; // omit empty optionals
    if (f.kind === 'number') fields[f.key] = Number(s);
    else if (f.kind === 'datetime') fields[f.key] = toIso(s);
    else if (f.kind === 'taglist') fields[f.key] = splitList(s);
    else fields[f.key] = s;
  }
  if (spec.value.injectsAuthorAsUserId && auth.user) {
    fields.author = auth.user.id;
  }

  emit('submit', { type: type.value, base, fields });
}

const inputCls =
  'w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] ' +
  'focus:outline-none focus:border-signal/40 transition';
const labelCls =
  'block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5';
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] bg-base/70 backdrop-blur-sm flex items-center justify-center px-4"
      @click="emit('cancel')"
    >
      <div
        class="w-[720px] max-h-[90vh] overflow-y-auto bg-base border border-rule-strong rounded-md shadow-2xl p-6"
        @click.stop
      >
        <header class="mb-5">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
            case · add artifact
          </p>
          <h3 class="text-[16px] text-ink">New artifact</h3>
        </header>

        <!-- Type picker -->
        <div class="mb-5">
          <label :class="labelCls">type</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="t in ARTIFACT_TYPES"
              :key="t"
              type="button"
              :class="[
                'px-2.5 py-1 rounded-sm border font-mono text-[11px] transition',
                type === t
                  ? 'border-signal/50 bg-signal/10 text-ink'
                  : 'border-rule text-ink-faint hover:text-ink-dim hover:border-rule-strong',
              ]"
              @click="type = t"
            >{{ ARTIFACT_TYPE_LABELS[t] }}</button>
          </div>
        </div>

        <!-- Base fields -->
        <div class="grid grid-cols-12 gap-3 mb-3">
          <div class="col-span-5">
            <label :class="labelCls">observed at <span class="text-sev-crit">*</span></label>
            <input v-model="observedAt" type="datetime-local" :class="inputCls" />
          </div>
          <div class="col-span-3">
            <label :class="labelCls">severity</label>
            <select v-model="severity" :class="inputCls">
              <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="col-span-4">
            <label :class="labelCls">confidence</label>
            <select v-model="confidence" :class="inputCls">
              <option v-for="c in CONFIDENCES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>

        <!-- Host (optional autocomplete) -->
        <div class="mb-3 relative">
          <label :class="labelCls">host asset <span class="text-ink-faint normal-case">· optional</span></label>
          <input
            v-model="hostSearch"
            type="text"
            placeholder="search asset by name…"
            :class="inputCls"
          />
          <ul
            v-if="hostHits.length"
            class="absolute z-10 mt-1 w-full max-h-[180px] overflow-y-auto bg-base border border-rule rounded shadow-xl"
          >
            <li
              v-for="h in hostHits"
              :key="h.id"
              class="px-3 py-1.5 text-[12px] hover:bg-surface cursor-pointer flex items-baseline justify-between gap-2"
              @click="pickHost(h)"
            >
              <span class="text-ink">{{ h.name }}</span>
              <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ h.kind }}</span>
            </li>
          </ul>
        </div>

        <!-- Per-type fields (descriptor-driven) -->
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div
            v-for="f in spec.fields"
            :key="f.key"
            :class="['textarea', 'taglist'].includes(f.kind) ? 'col-span-2' : 'col-span-1'"
          >
            <label :class="labelCls">
              {{ f.label }}
              <span v-if="f.required" class="text-sev-crit">*</span>
            </label>

            <select
              v-if="f.kind === 'select'"
              v-model="fieldVals[f.key] as string"
              :class="inputCls"
            >
              <option value="">— select —</option>
              <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
            </select>

            <textarea
              v-else-if="f.kind === 'textarea'"
              v-model="fieldVals[f.key] as string"
              :placeholder="f.placeholder"
              class="w-full min-h-[80px] px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] font-mono text-ink-mid focus:outline-none focus:border-signal/40 transition resize-y"
            />

            <label
              v-else-if="f.kind === 'checkbox'"
              class="flex items-center gap-2 mt-1 text-[13px] text-ink-dim cursor-pointer"
            >
              <input v-model="fieldVals[f.key] as boolean" type="checkbox" class="accent-signal" />
              {{ f.label }}
            </label>

            <input
              v-else
              v-model="fieldVals[f.key] as string"
              :type="f.kind === 'number' ? 'number' : f.kind === 'datetime' ? 'datetime-local' : 'text'"
              :placeholder="f.kind === 'taglist' ? (f.placeholder ?? 'semicolon-separated') : f.placeholder"
              :class="inputCls"
            />
          </div>
        </div>

        <!-- Notes + tags -->
        <div class="mb-3">
          <label :class="labelCls">notes</label>
          <input v-model="notes" type="text" placeholder="(optional)" :class="inputCls" />
        </div>
        <div class="mb-5">
          <label :class="labelCls">tags</label>
          <input v-model="tagsRaw" type="text" placeholder="semicolon-separated" :class="inputCls" />
        </div>

        <footer class="flex items-center justify-end gap-3 border-t border-rule pt-4">
          <span v-if="missing.length" class="font-mono text-[10px] text-ink-faint mr-auto">
            need: {{ missing.join(', ') }}
          </span>
          <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            :loading="loading"
            :disabled="missing.length > 0"
            @click="onSubmit"
          >Add {{ ARTIFACT_TYPE_LABELS[type].toLowerCase() }}</Button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
