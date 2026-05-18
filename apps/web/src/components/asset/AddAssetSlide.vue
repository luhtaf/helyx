<script setup lang="ts">
// Manual asset add — slide-over from /assets header.
//
// Two modes:
//  - Form: kind/name/hostname/IPs + parent (tier) + owning stakeholder
//    (OWNS edge) + optional CycloneDX SBOM attached at create time.
//  - Advanced (JSON): paste a raw CreateAssetInput object for full
//    control / fields the form doesn't surface. SBOM dropzone still
//    applies on top.
//
// Emits 'submit' with { input, sbom?, sbomFilename? }; the parent runs
// createAsset then ingestSbom (if SBOM present) + toasts.

import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { ASSET_KINDS, type AssetKind } from '@/composables/asset-kinds';
import { useAssetAutocomplete, type CreateAssetInput, type AssetAutocompleteHit } from '@/composables/useAssets';
import { useStakeholderAutocomplete, type StakeholderHit } from '@/composables/useStakeholders';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{
  open: boolean;
  loading: boolean;
  /** Pre-pick a parent (e.g. opened from a /graph Asset node). */
  presetParent?: { id: string; label: string } | null;
}>();
const emit = defineEmits<{
  (e: 'submit', payload: {
    input: CreateAssetInput;
    sbom: string | null;
    sbomFilename: string | null;
  }): void;
  (e: 'cancel'): void;
}>();

const mode = ref<'form' | 'json'>('form');

// ── Form fields ──────────────────────────────────────────────────────
const kind = ref<AssetKind>('HOST');
const name = ref('');
const hostname = ref('');
const ipsRaw = ref('');

// Parent (tier hierarchy)
const parentSearch = ref('');
const parentId = ref<string | null>(null);
const parentLabel = ref('');
const { search: searchAssets } = useAssetAutocomplete();
const parentHits = ref<AssetAutocompleteHit[]>([]);
const parentOpen = ref(false);
const runParentSearch = useDebounceFn(async (q: string) => {
  parentHits.value = await searchAssets(q);
}, 250);
watch(parentSearch, (q) => {
  if (q !== parentLabel.value) parentId.value = null;
  parentOpen.value = q.trim().length >= 2;
  void runParentSearch(q);
});
function pickParent(h: AssetAutocompleteHit): void {
  parentId.value = h.id;
  parentSearch.value = `${h.name} (${h.kind})`;
  parentLabel.value = parentSearch.value;
  parentOpen.value = false;
}

// Owning stakeholder (OWNS edge)
const skSearch = ref('');
const skId = ref<string | null>(null);
const skLabel = ref('');
const { search: searchStakeholders } = useStakeholderAutocomplete();
const skHits = ref<StakeholderHit[]>([]);
const skOpen = ref(false);
const runSkSearch = useDebounceFn(async (q: string) => {
  skHits.value = await searchStakeholders(q);
}, 250);
watch(skSearch, (q) => {
  if (q !== skLabel.value) skId.value = null;
  skOpen.value = q.trim().length >= 2;
  void runSkSearch(q);
});
function pickSk(h: StakeholderHit): void {
  skId.value = h.id;
  skSearch.value = h.name;
  skLabel.value = h.name;
  skOpen.value = false;
}

// ── SBOM (optional, both modes) ──────────────────────────────────────
const sbomText = ref('');
const sbomFilename = ref('');
function onSbomFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  sbomFilename.value = f.name;
  const reader = new FileReader();
  reader.onload = () => { sbomText.value = String(reader.result ?? ''); };
  reader.readAsText(f);
}
function clearSbom(): void {
  sbomText.value = '';
  sbomFilename.value = '';
}

// ── Advanced JSON ────────────────────────────────────────────────────
const jsonRaw = ref('');
const jsonError = ref('');
const JSON_SAMPLE = `{
  "kind": "HOST",
  "name": "mfg-srv-01.acme.co.id",
  "hostname": "mfg-srv-01",
  "ipAddresses": ["10.0.1.5", "10.0.1.6"],
  "parentId": null,
  "stakeholderId": null
}`;

function reset(): void {
  mode.value = 'form';
  kind.value = 'HOST';
  name.value = '';
  hostname.value = '';
  ipsRaw.value = '';
  parentSearch.value = ''; parentId.value = null; parentLabel.value = '';
  skSearch.value = ''; skId.value = null; skLabel.value = '';
  clearSbom();
  jsonRaw.value = '';
  jsonError.value = '';
}
watch(() => props.open, (o) => {
  if (!o) { reset(); return; }
  // Opened from a graph Asset node → pre-pick that node as parent.
  if (props.presetParent) {
    parentId.value = props.presetParent.id;
    parentSearch.value = props.presetParent.label;
    parentLabel.value = props.presetParent.label;
  }
});

function onKey(e: KeyboardEvent): void {
  if (props.open && e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function buildFromForm(): CreateAssetInput {
  const ips = ipsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean);
  return {
    kind: kind.value,
    name: name.value.trim(),
    hostname: hostname.value.trim() || null,
    ipAddresses: ips.length > 0 ? ips : null,
    parentId: parentId.value,
    stakeholderId: skId.value,
  };
}

function buildFromJson(): CreateAssetInput | null {
  jsonError.value = '';
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonRaw.value) as Record<string, unknown>;
  } catch (e) {
    jsonError.value = `Invalid JSON: ${(e as Error).message}`;
    return null;
  }
  const k = obj.kind;
  const n = obj.name;
  if (typeof k !== 'string' || !ASSET_KINDS.includes(k as AssetKind)) {
    jsonError.value = `kind must be one of: ${ASSET_KINDS.join(', ')}`;
    return null;
  }
  if (typeof n !== 'string' || n.trim() === '') {
    jsonError.value = 'name is required';
    return null;
  }
  const ips = Array.isArray(obj.ipAddresses)
    ? (obj.ipAddresses as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
    : null;
  return {
    kind: k as AssetKind,
    name: n.trim(),
    hostname: typeof obj.hostname === 'string' ? obj.hostname.trim() || null : null,
    ipAddresses: ips && ips.length > 0 ? ips : null,
    parentId: typeof obj.parentId === 'string' ? obj.parentId : null,
    stakeholderId: typeof obj.stakeholderId === 'string' ? obj.stakeholderId : null,
  };
}

const canSubmit = () =>
  mode.value === 'json'
    ? jsonRaw.value.trim().length > 0
    : Boolean(kind.value && name.value.trim());

function onSubmit(): void {
  const input = mode.value === 'json' ? buildFromJson() : buildFromForm();
  if (!input) return; // json parse/validation error shown inline
  emit('submit', {
    input,
    sbom: sbomText.value.trim() || null,
    sbomFilename: sbomFilename.value || null,
  });
}

const fieldCls =
  'w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] ' +
  'focus:outline-none focus:border-signal/40 transition';
const labelCls =
  'block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5';
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150" leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[55] bg-base/70 backdrop-blur-sm" @click="emit('cancel')">
        <Transition
          enter-active-class="transition-transform duration-200 ease-out" enter-from-class="translate-x-full"
          leave-active-class="transition-transform duration-150 ease-in" leave-to-class="translate-x-full" appear
        >
          <aside
            class="fixed top-0 right-0 bottom-0 w-[520px] bg-base border-l border-rule-strong shadow-2xl flex flex-col"
            @click.stop
          >
            <header class="px-6 py-5 border-b border-rule-strong">
              <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
                inventory · manual add
              </p>
              <div class="flex items-baseline justify-between">
                <h2 class="text-[18px] text-ink font-medium tracking-tight">Add asset</h2>
                <div class="flex gap-1 font-mono text-[10px] uppercase tracking-wider">
                  <button
                    type="button"
                    :class="mode === 'form' ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'"
                    @click="mode = 'form'"
                  >form</button>
                  <span class="text-ink-faint">·</span>
                  <button
                    type="button"
                    :class="mode === 'json' ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'"
                    @click="mode = 'json'"
                  >json (advanced)</button>
                </div>
              </div>
            </header>

            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <!-- FORM MODE -->
              <template v-if="mode === 'form'">
                <div>
                  <label :class="labelCls">kind <span class="text-sev-crit">*</span></label>
                  <select v-model="kind" :class="fieldCls">
                    <option v-for="k in ASSET_KINDS" :key="k" :value="k">{{ k }}</option>
                  </select>
                </div>
                <div>
                  <label :class="labelCls">name <span class="text-sev-crit">*</span></label>
                  <input v-model="name" type="text" placeholder="mfg-srv-01.acme.co.id" :class="fieldCls" />
                </div>
                <div>
                  <label :class="labelCls">hostname</label>
                  <input v-model="hostname" type="text" placeholder="(optional FQDN)" :class="fieldCls" />
                </div>
                <div>
                  <label :class="labelCls">ip addresses</label>
                  <textarea
                    v-model="ipsRaw"
                    placeholder="one per line — 10.0.1.5"
                    class="w-full min-h-[56px] px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] font-mono focus:outline-none focus:border-signal/40 transition resize-y"
                  />
                </div>

                <!-- Parent -->
                <div class="relative">
                  <label :class="labelCls">parent (containing asset)</label>
                  <input
                    v-model="parentSearch"
                    type="text"
                    placeholder="type 2+ chars…"
                    :class="fieldCls"
                    @focus="parentOpen = parentSearch.trim().length >= 2"
                  />
                  <ul
                    v-if="parentOpen && parentHits.length"
                    class="absolute left-0 right-0 mt-1 bg-surface border border-rule-strong rounded shadow-2xl max-h-[160px] overflow-y-auto z-10"
                  >
                    <li
                      v-for="h in parentHits"
                      :key="h.id"
                      class="px-3 py-1.5 text-[12px] hover:bg-rule cursor-pointer flex items-baseline justify-between gap-2"
                      @click="pickParent(h)"
                    >
                      <span class="text-ink">{{ h.name }}</span>
                      <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ h.kind }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Owning stakeholder -->
                <div class="relative">
                  <label :class="labelCls">owning stakeholder <span class="text-ink-faint normal-case">· optional</span></label>
                  <input
                    v-model="skSearch"
                    type="text"
                    placeholder="type 2+ chars…"
                    :class="fieldCls"
                    @focus="skOpen = skSearch.trim().length >= 2"
                  />
                  <ul
                    v-if="skOpen && skHits.length"
                    class="absolute left-0 right-0 mt-1 bg-surface border border-rule-strong rounded shadow-2xl max-h-[160px] overflow-y-auto z-10"
                  >
                    <li
                      v-for="h in skHits"
                      :key="h.id"
                      class="px-3 py-1.5 text-[12px] hover:bg-rule cursor-pointer flex items-baseline justify-between gap-2"
                      @click="pickSk(h)"
                    >
                      <span class="text-ink">{{ h.name }}</span>
                      <span class="font-mono text-[10px] text-ink-faint">{{ h.slug }}</span>
                    </li>
                  </ul>
                </div>
              </template>

              <!-- JSON MODE -->
              <template v-else>
                <div>
                  <label :class="labelCls">CreateAssetInput JSON <span class="text-sev-crit">*</span></label>
                  <textarea
                    v-model="jsonRaw"
                    :placeholder="JSON_SAMPLE"
                    class="w-full min-h-[280px] px-3 py-2 bg-surface border border-rule-strong rounded text-[11px] font-mono text-ink-mid focus:outline-none focus:border-signal/40 transition resize-y"
                    spellcheck="false"
                  />
                  <p v-if="jsonError" class="mt-1 font-mono text-[10px] text-sev-crit">{{ jsonError }}</p>
                  <p v-else class="mt-1 font-mono text-[10px] text-ink-faint">
                    keys: kind* name* hostname ipAddresses[] parentId stakeholderId
                  </p>
                </div>
              </template>

              <!-- SBOM (both modes) -->
              <div class="border-t border-rule pt-4">
                <label :class="labelCls">attach SBOM (CycloneDX) <span class="text-ink-faint normal-case">· optional</span></label>
                <div class="flex items-center gap-3">
                  <input type="file" accept=".json,application/json" class="text-[12px] text-ink-dim" @change="onSbomFile" />
                  <button
                    v-if="sbomText"
                    type="button"
                    class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-sev-crit transition"
                    @click="clearSbom"
                  >clear</button>
                </div>
                <p v-if="sbomFilename" class="mt-1 font-mono text-[10px] text-sev-low">
                  {{ sbomFilename }} · {{ Math.round(sbomText.length / 1024) }}kb — ingested after asset create
                </p>
              </div>
            </div>

            <footer class="px-6 py-4 border-t border-rule-strong flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
              <Button variant="primary" size="sm" :loading="loading" :disabled="!canSubmit()" @click="onSubmit">
                Add asset
              </Button>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
