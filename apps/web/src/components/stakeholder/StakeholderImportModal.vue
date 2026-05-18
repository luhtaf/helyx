<script setup lang="ts">
// Bulk-onboard stakeholders from a CSV blob. National-inventory case:
// sektoral lists arrive as spreadsheets — paste the CSV, review the
// result (created / skipped / per-line errors), close.
//
// Import is additive + idempotent server-side: existing slugs are
// skipped, parse errors are reported per-line, valid rows still commit.
// So re-pasting a corrected file is safe.

import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { StakeholderImportResult } from '@/composables/useStakeholders';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', csv: string): void;
  (e: 'cancel'): void;
}>();

const csv = ref('');
const result = ref<StakeholderImportResult | null>(null);

const SAMPLE = `name,slug,sektor,city,aliases,notes
Direktorat Jenderal Pajak,ditjen-pajak,Administrasi Pemerintahan,Jakarta,DJP;Pajak,kantor pusat
PT Telkom Indonesia,,TIK,Bandung,Telkom;TLKM,BUMN telekomunikasi
Bank Mandiri,,Keuangan,Jakarta,,`;

function reset(): void {
  csv.value = '';
  result.value = null;
}
watch(() => props.open, (o) => { if (o) reset(); });

function loadSample(): void {
  csv.value = SAMPLE;
}

// Parent calls back with the result via setResult (exposed) so the
// modal can show the outcome without closing — operator reviews errors.
function setResult(r: StakeholderImportResult | null): void {
  result.value = r;
}
defineExpose({ setResult });

function onKey(e: KeyboardEvent): void {
  if (props.open && e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function onSubmit(): void {
  if (!csv.value.trim()) return;
  emit('submit', csv.value);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] bg-base/70 backdrop-blur-sm flex items-center justify-center px-4"
      @click="emit('cancel')"
    >
      <div class="w-[680px] max-h-[88vh] overflow-y-auto bg-base border border-rule-strong rounded-md shadow-2xl p-6" @click.stop>
        <header class="mb-4">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">inventory · bulk import</p>
          <h3 class="text-[16px] text-ink">Import stakeholders from CSV</h3>
        </header>

        <p class="text-[12px] text-ink-dim mb-3 leading-relaxed">
          Header (case-insensitive, any order):
          <code class="font-mono text-[11px] text-signal">name</code> (required),
          <code class="font-mono text-[11px] text-ink-mid">slug</code>,
          <code class="font-mono text-[11px] text-ink-mid">sektor</code> (slug or name),
          <code class="font-mono text-[11px] text-ink-mid">city</code>,
          <code class="font-mono text-[11px] text-ink-mid">aliases</code> (semicolon-sep),
          <code class="font-mono text-[11px] text-ink-mid">notes</code>.
          Additive — existing slugs are skipped.
        </p>

        <textarea
          v-model="csv"
          class="w-full min-h-[220px] px-3 py-2 bg-surface border border-rule-strong rounded text-[11px] font-mono text-ink-mid focus:outline-none focus:border-signal/40 transition resize-y"
          placeholder="name,sektor,city&#10;PT Contoh,TIK,Jakarta"
          spellcheck="false"
        />
        <button
          type="button"
          class="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-signal transition"
          @click="loadSample"
        >load sample</button>

        <!-- Result panel -->
        <div v-if="result" class="mt-4 border border-rule rounded-md p-3 bg-surface/30">
          <div class="flex items-center gap-4 text-[12px]">
            <span class="text-sev-low font-mono">created: {{ result.created }}</span>
            <span class="text-ink-dim font-mono">skipped: {{ result.skipped }}</span>
            <span :class="['font-mono', result.errors.length ? 'text-sev-crit' : 'text-ink-faint']">
              errors: {{ result.errors.length }}
            </span>
          </div>
          <ul v-if="result.errors.length" class="mt-2 max-h-[140px] overflow-y-auto space-y-0.5">
            <li
              v-for="(e, i) in result.errors"
              :key="i"
              class="font-mono text-[10px] text-sev-crit"
            >
              line {{ e.line }}: {{ e.reason }}
            </li>
          </ul>
          <p v-if="result.created > 0" class="mt-2 font-mono text-[10px] text-ink-faint">
            list refreshed — close to see the new rows.
          </p>
        </div>

        <footer class="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" @click="emit('cancel')">
            {{ result ? 'Close' : 'Cancel' }}
          </Button>
          <Button
            variant="primary"
            size="sm"
            :loading="loading"
            :disabled="!csv.trim()"
            @click="onSubmit"
          >{{ result ? 'Import again' : 'Import' }}</Button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
