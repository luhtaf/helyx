<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { GraphNode } from './graph-types';
import { severityClass } from '@/utils/severity';
import {
  CTI_IOC_TYPES,
  useActorTtpIndicators,
  useAddCtiIoc,
  useAddCtiIocsBulk,
  useDeleteCtiIoc,
  type CtiIocType,
} from '@/composables/useCtiIocs';
import { useToast } from '@/composables/useToast';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ node: GraphNode | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const route = useRoute();
const { show: showToast } = useToast();

interface KV { label: string; value: string; mono?: boolean; severity?: string }

const fields = computed<KV[]>(() => {
  if (!props.node) return [];
  const d = (props.node.data ?? {}) as Record<string, unknown>;
  const out: KV[] = [
    { label: 'type', value: props.node.type, mono: true },
    { label: 'id', value: props.node.entityId, mono: true },
  ];
  switch (props.node.type) {
    case 'Stakeholder':
      if (d.slug) out.push({ label: 'slug', value: String(d.slug), mono: true });
      break;
    case 'Asset':
      if (d.kind) out.push({ label: 'kind', value: String(d.kind), mono: true });
      if (d.hostname) out.push({ label: 'hostname', value: String(d.hostname), mono: true });
      break;
    case 'CVE':
      if (d.severity) out.push({ label: 'severity', value: String(d.severity), severity: String(d.severity) });
      if (d.baseScore != null) out.push({ label: 'cvss v3.1', value: String(d.baseScore), mono: true });
      if (d.description) out.push({ label: 'description', value: String(d.description) });
      break;
    case 'Case':
      if (d.title) out.push({ label: 'title', value: String(d.title) });
      if (d.status) out.push({ label: 'status', value: String(d.status), mono: true });
      break;
    case 'Sektor':
      if (d.slug) out.push({ label: 'slug', value: String(d.slug), mono: true });
      break;
    case 'CWE':
      if (d.name) out.push({ label: 'name', value: String(d.name) });
      break;
  }
  return out;
});

function detailHref(): string | null {
  if (!props.node) return null;
  switch (props.node.type) {
    case 'Stakeholder': return `/stakeholders/${props.node.entityId}`;
    case 'Case': return `/cases/${props.node.entityId}`;
    default: return null;
  }
}

// W2.5 — Actor × TTP indicators panel.
// Shows when graph route has both ?ttp= and ?actor= AND the selected
// node is the AttackPattern (TTP) or ThreatActor (Actor) — i.e. one
// of the endpoints of the (Actor × TTP) edge the user is exploring.
const ttpCode = computed(() => (route.query.ttp as string | undefined)?.toUpperCase() ?? null);
const actorParam = computed(() => (route.query.actor as string | undefined) ?? null);
const showIndicators = computed(() =>
  Boolean(ttpCode.value && actorParam.value && props.node && (props.node.type === 'AttackPattern' || props.node.type === 'ThreatActor'))
);

const { indicators, loading: indicatorsLoading } = useActorTtpIndicators(
  () => actorParam.value,
  () => ttpCode.value,
);
const { submit: addIoc, loading: adding } = useAddCtiIoc();
const { submit: addIocsBulk, loading: addingBulk } = useAddCtiIocsBulk();
const { submit: deleteIoc } = useDeleteCtiIoc();

// Inline add form state — collapsed by default to keep the panel compact.
const addOpen = ref(false);
const addMode = ref<'single' | 'bulk'>('single');  // W2.5b
const newType = ref<CtiIocType>('DOMAIN');
const newValue = ref('');
const newSource = ref('');
const newNotes = ref('');
const bulkText = ref('');
const addErr = ref<string | null>(null);

// Live count of non-empty lines in bulk paste — gives operator instant feedback.
const bulkLineCount = computed(() =>
  bulkText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length,
);

async function onAdd(): Promise<void> {
  addErr.value = null;
  if (!ttpCode.value || !actorParam.value) return;
  const v = newValue.value.trim();
  if (!v) { addErr.value = 'Value required'; return; }
  try {
    const created = await addIoc({
      iocType: newType.value,
      value: v,
      source: newSource.value.trim() || null,
      notes: newNotes.value.trim() || null,
      actorId: actorParam.value,
      techniqueId: ttpCode.value,
    });
    if (created) {
      showToast(`Added ${created.iocType}: ${created.value}`, 'success');
      newValue.value = '';
      newSource.value = '';
      newNotes.value = '';
      // Keep form open for rapid multi-add — operator may have several IOCs queued.
    }
  } catch (e) {
    addErr.value = (e as Error).message ?? 'add failed';
  }
}

async function onAddBulk(): Promise<void> {
  addErr.value = null;
  if (!ttpCode.value || !actorParam.value) return;
  const lines = bulkText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) { addErr.value = 'Paste at least one value'; return; }
  if (lines.length > 500) { addErr.value = 'Max 500 IOCs per paste — split into smaller batches'; return; }
  try {
    const r = await addIocsBulk({
      iocType: newType.value,
      values: lines,
      source: newSource.value.trim() || null,
      notes: newNotes.value.trim() || null,
      actorId: actorParam.value,
      techniqueId: ttpCode.value,
    });
    if (r) {
      const dupNote = r.duplicates > 0 ? ` · ${r.duplicates} dup` : '';
      const invNote = r.invalid > 0 ? ` · ${r.invalid} invalid` : '';
      showToast(`Added ${r.added} ${newType.value}${dupNote}${invNote}`, 'success');
      bulkText.value = '';
      // Stay in bulk mode — operator may have multiple paste batches queued.
    }
  } catch (e) {
    addErr.value = (e as Error).message ?? 'bulk add failed';
  }
}

async function onDelete(id: string, value: string): Promise<void> {
  if (!confirm(`Delete IOC "${value}"?`)) return;
  const ok = await deleteIoc(id);
  if (ok) showToast(`Deleted ${value}`, 'success');
  else showToast('Delete failed', 'error');
}
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-200"
    enter-from-class="translate-x-full"
    leave-active-class="transition-transform duration-200"
    leave-to-class="translate-x-full"
  >
    <aside
      v-if="node"
      class="fixed top-0 right-0 h-screen w-[400px] bg-base border-l border-rule-strong z-30 overflow-y-auto"
    >
      <div class="p-6">
        <header class="flex items-baseline justify-between mb-4 pb-3 border-b border-rule-strong">
          <div class="min-w-0">
            <p class="font-mono text-[9px] uppercase tracking-wider text-ink-faint">selected</p>
            <h3 class="text-[16px] text-ink truncate mt-0.5">{{ node.label }}</h3>
          </div>
          <button
            type="button"
            class="font-mono text-[10px] text-ink-faint hover:text-ink transition shrink-0 ml-3"
            @click="emit('close')"
          >ESC</button>
        </header>

        <dl class="space-y-3 text-[12px]">
          <div v-for="f in fields" :key="f.label">
            <dt class="font-mono text-[9px] uppercase tracking-wider text-ink-faint">{{ f.label }}</dt>
            <dd
              :class="[
                'mt-0.5 break-words',
                f.mono ? 'font-mono' : '',
                f.severity ? severityClass(f.severity) : 'text-ink-dim',
              ]"
            >{{ f.value }}</dd>
          </div>
        </dl>

        <RouterLink
          v-if="detailHref()"
          :to="detailHref()!"
          class="mt-6 inline-block font-mono text-[11px] text-signal hover:underline"
        >Open detail page →</RouterLink>

        <!-- W2.5 — Actor × TTP indicators panel -->
        <section v-if="showIndicators" class="mt-6 pt-5 border-t border-rule-strong">
          <header class="flex items-baseline justify-between mb-3">
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              actor × ttp indicators
            </p>
            <span class="font-mono text-[10px] text-ink-faint tabular-nums">
              {{ indicators.length }} / {{ ttpCode }}
            </span>
          </header>

          <p v-if="indicatorsLoading && indicators.length === 0" class="text-[11px] text-ink-dim">loading…</p>

          <ul v-else-if="indicators.length" class="space-y-2 mb-4">
            <li v-for="ind in indicators" :key="ind.id" class="border border-rule rounded-md px-3 py-2">
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-mono text-[9px] uppercase tracking-wider text-signal shrink-0">{{ ind.iocType }}</span>
                <button
                  type="button"
                  class="font-mono text-[9px] text-ink-faint hover:text-sev-crit transition shrink-0"
                  @click="onDelete(ind.id, ind.value)"
                >del</button>
              </div>
              <p class="font-mono text-[12px] text-ink break-all mt-0.5">{{ ind.value }}</p>
              <p v-if="ind.source" class="font-mono text-[10px] text-ink-faint mt-0.5">via {{ ind.source }}</p>
              <p v-if="ind.notes" class="text-[11px] text-ink-dim mt-0.5">{{ ind.notes }}</p>
            </li>
          </ul>

          <p v-else class="text-[11px] text-ink-faint italic mb-3">
            no indicators yet for this actor × ttp pair.
          </p>

          <button
            v-if="!addOpen"
            type="button"
            class="font-mono text-[11px] text-signal hover:underline"
            @click="addOpen = true"
          >+ add indicator</button>

          <div v-else class="border border-rule-strong rounded-md p-3 space-y-2">
            <!-- W2.5b: mode toggle (single | bulk) -->
            <div class="flex items-center gap-2 pb-1 border-b border-rule">
              <button
                type="button"
                :class="['font-mono text-[10px] uppercase tracking-wider transition', addMode === 'single' ? 'text-signal' : 'text-ink-faint hover:text-ink-dim']"
                @click="addMode = 'single'"
              >single</button>
              <span class="text-ink-faint">·</span>
              <button
                type="button"
                :class="['font-mono text-[10px] uppercase tracking-wider transition', addMode === 'bulk' ? 'text-signal' : 'text-ink-faint hover:text-ink-dim']"
                @click="addMode = 'bulk'"
              >bulk paste</button>
            </div>

            <div class="flex gap-2">
              <select
                v-model="newType"
                class="bg-surface border border-rule-strong rounded-sm px-2 py-1 text-[12px] text-ink font-mono shrink-0"
              >
                <option v-for="t in CTI_IOC_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
              <Input v-if="addMode === 'single'" v-model="newValue" placeholder="value (IP, domain, hash …)" class="flex-1" />
              <p v-else class="font-mono text-[10px] text-ink-faint self-center tabular-nums">
                {{ bulkLineCount }} line{{ bulkLineCount === 1 ? '' : 's' }}
              </p>
            </div>

            <textarea
              v-if="addMode === 'bulk'"
              v-model="bulkText"
              rows="6"
              placeholder="paste one IOC per line — server will trim, dedupe, and merge"
              class="w-full bg-surface border border-rule-strong rounded-sm px-2 py-1 text-[12px] text-ink font-mono resize-y"
            />

            <Input v-model="newSource" placeholder="source (optional, e.g. OTX-pulse-12345)" />
            <Input v-if="addMode === 'single'" v-model="newNotes" placeholder="notes (optional)" />
            <p v-if="addErr" class="text-[11px] text-sev-crit">{{ addErr }}</p>
            <div class="flex items-center gap-2">
              <Button
                v-if="addMode === 'single'"
                variant="primary" size="sm"
                :loading="adding"
                :disabled="!newValue.trim()"
                @click="onAdd"
              >Add</Button>
              <Button
                v-else
                variant="primary" size="sm"
                :loading="addingBulk"
                :disabled="bulkLineCount === 0"
                @click="onAddBulk"
              >Add {{ bulkLineCount }}</Button>
              <Button variant="ghost" size="sm" @click="addOpen = false; newValue = ''; bulkText = ''; addErr = null">Done</Button>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </Transition>
</template>
