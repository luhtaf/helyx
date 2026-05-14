<script setup lang="ts">
// Manual asset add — slide-over from /assets header.
//
// Operator workflow: ops engineer registers assets that aren't in
// spiderfoot/SBOM (e.g. a hypervisor, a manually-tracked appliance).
// Required: kind + name. Optional: hostname, IPs (one per line),
// parent (autocomplete by name+kind for tier hierarchy).
//
// Submit emits 'submit' with CreateAssetInput; parent handles the
// mutation + toast. Cancel/Esc/backdrop close.

import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { ASSET_KINDS, type AssetKind } from '@/composables/asset-kinds';
import { useAssetAutocomplete, type CreateAssetInput, type AssetAutocompleteHit } from '@/composables/useAssets';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', input: CreateAssetInput): void;
  (e: 'cancel'): void;
}>();

const kind = ref<AssetKind>('HOST');
const name = ref('');
const hostname = ref('');
const ipsRaw = ref('');
const parentSearch = ref('');
const parentId = ref<string | null>(null);
const parentLabel = ref('');

const { search: searchAssets } = useAssetAutocomplete();
const parentHits = ref<AssetAutocompleteHit[]>([]);
const parentDropdownOpen = ref(false);

const runParentSearch = useDebounceFn(async (q: string) => {
  parentHits.value = await searchAssets(q);
}, 250);

watch(parentSearch, (q) => {
  // If operator is typing fresh, clear the previously-picked parent.
  if (q !== parentLabel.value) parentId.value = null;
  parentDropdownOpen.value = q.trim().length >= 2;
  void runParentSearch(q);
});

function pickParent(hit: AssetAutocompleteHit): void {
  parentId.value = hit.id;
  parentSearch.value = `${hit.name} (${hit.kind})`;
  parentLabel.value = parentSearch.value;
  parentDropdownOpen.value = false;
}

function clearParent(): void {
  parentId.value = null;
  parentSearch.value = '';
  parentLabel.value = '';
  parentHits.value = [];
}

function reset(): void {
  kind.value = 'HOST';
  name.value = '';
  hostname.value = '';
  ipsRaw.value = '';
  clearParent();
}

watch(() => props.open, (isOpen) => { if (!isOpen) reset(); });

function onKey(e: KeyboardEvent): void {
  if (!props.open) return;
  if (e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const canSubmit = () => Boolean(kind.value && name.value.trim().length > 0);

function onSubmit(): void {
  if (!canSubmit()) return;
  // Parse IPs: one per line, strip blanks. No regex validation here —
  // backend ipAddresses is just String[], let it through.
  const ips = ipsRaw.value
    .split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  emit('submit', {
    kind: kind.value,
    name: name.value.trim(),
    hostname: hostname.value.trim() || null,
    ipAddresses: ips.length > 0 ? ips : null,
    parentId: parentId.value,
  });
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
        class="fixed inset-0 z-[55] bg-base/70 backdrop-blur-sm"
        @click="emit('cancel')"
      >
        <Transition
          enter-active-class="transition-transform duration-200 ease-out"
          enter-from-class="translate-x-full"
          leave-active-class="transition-transform duration-150 ease-in"
          leave-to-class="translate-x-full"
          appear
        >
          <aside
            class="fixed top-0 right-0 bottom-0 w-[480px] bg-base border-l border-rule-strong shadow-2xl flex flex-col"
            @click.stop
          >
            <header class="px-6 py-5 border-b border-rule-strong">
              <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
                inventory · manual add
              </p>
              <h2 class="text-[18px] text-ink font-medium tracking-tight">Add asset</h2>
            </header>

            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <!-- Kind -->
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
                  kind <span class="text-sev-crit">*</span>
                </label>
                <select
                  v-model="kind"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                >
                  <option v-for="k in ASSET_KINDS" :key="k" :value="k">{{ k }}</option>
                </select>
              </div>

              <!-- Name -->
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
                  name <span class="text-sev-crit">*</span>
                </label>
                <input
                  v-model="name"
                  type="text"
                  placeholder="e.g. mfg-srv-01.acme.co.id"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>

              <!-- Hostname -->
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
                  hostname
                </label>
                <input
                  v-model="hostname"
                  type="text"
                  placeholder="(optional FQDN)"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>

              <!-- IPs -->
              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
                  ip addresses
                </label>
                <textarea
                  v-model="ipsRaw"
                  placeholder="one per line — 10.0.1.5"
                  class="w-full min-h-[64px] px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] font-mono focus:outline-none focus:border-signal/40 transition resize-y"
                />
              </div>

              <!-- Parent autocomplete -->
              <div class="relative">
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
                  parent (containing asset)
                </label>
                <div class="flex items-center gap-2">
                  <input
                    v-model="parentSearch"
                    type="text"
                    placeholder="type 2+ chars to search…"
                    class="flex-1 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                    @focus="parentDropdownOpen = parentSearch.trim().length >= 2"
                  />
                  <button
                    v-if="parentId"
                    type="button"
                    class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-sev-crit transition"
                    @click="clearParent"
                  >clear</button>
                </div>
                <ul
                  v-if="parentDropdownOpen && parentHits.length"
                  class="absolute left-0 right-0 mt-1 bg-surface border border-rule-strong rounded shadow-2xl max-h-[180px] overflow-y-auto z-10"
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
                <p v-if="parentDropdownOpen && parentSearch.trim().length >= 2 && parentHits.length === 0" class="mt-1 font-mono text-[10px] text-ink-faint">
                  no matches
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
