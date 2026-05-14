<script setup lang="ts">
// /admin/inventory-inbox — review queue for scanner ingest results.
//
// Operator workflow: each pending ScanReport contains discovered
// items (assets reported by scanner agent). Operator picks one of:
//   - merge to existing Asset (this machine is already in inventory)
//   - accept as new (creates a real Asset, threads parent chain)
//   - reject (false positive / off-scope)
//
// When all items in a report move off pending, report auto-flips to
// status='reviewed' (BE-side).

import { ref, computed, watch } from 'vue';
import {
  useScanReports, useDiscoveredAssets, useDiscoveredMutations,
  type ScanReport, type DiscoveredAsset, type ScanReportStatus,
} from '@/composables/useScanners';
import { useAssetAutocomplete, type AssetAutocompleteHit } from '@/composables/useAssets';
import { useDebounceFn } from '@vueuse/core';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const filterStatus = ref<ScanReportStatus | ''>('pending');
const reportFilter = computed(() => ({ status: filterStatus.value || null }));
const { reports, loading: loadingReports } = useScanReports(() => reportFilter.value, 50);

// Selected report (right-pane detail).
const selectedReportId = ref<string>('');
function selectReport(r: ScanReport): void {
  selectedReportId.value = r.id;
}
// Auto-pick first pending on load.
watch(reports, (rs) => {
  if (!selectedReportId.value && rs.length > 0) selectedReportId.value = rs[0]!.id;
}, { immediate: true });

const { items, loading: loadingItems } = useDiscoveredAssets(() => selectedReportId.value);
const pendingItems = computed(() => items.value.filter((i) => i.status === 'pending'));
const reviewedItems = computed(() => items.value.filter((i) => i.status !== 'pending'));

// Mutations
const { merge, accept, reject, submitting } = useDiscoveredMutations();
const { show: showToast } = useToast();
const { confirm } = useConfirm();

async function onAccept(d: DiscoveredAsset): Promise<void> {
  const r = await accept(d.id);
  if (r) showToast(`Created asset ${r.name}`, 'success');
  else showToast('Accept failed', 'error');
}

async function onReject(d: DiscoveredAsset): Promise<void> {
  const ok = await confirm({
    title: `Reject ${d.name}?`,
    message: 'False positive or off-scope. Audit chain preserved.',
    variant: 'danger',
    confirmLabel: 'Reject',
  });
  if (!ok) return;
  const r = await reject(d.id, null);
  if (r) showToast(`Rejected ${d.name}`, 'success');
  else showToast('Reject failed', 'error');
}

// Merge — needs asset autocomplete per row
const mergeOpenFor = ref<string | null>(null);
const mergeSearch = ref('');
const mergeHits = ref<AssetAutocompleteHit[]>([]);
const { search: searchAssets } = useAssetAutocomplete();
const runMergeSearch = useDebounceFn(async (q: string) => {
  mergeHits.value = await searchAssets(q);
}, 250);
watch(mergeSearch, (q) => { void runMergeSearch(q); });

function openMerge(d: DiscoveredAsset): void {
  mergeOpenFor.value = d.id;
  mergeSearch.value = d.name; // pre-fill — likely match
  mergeHits.value = [];
}
function closeMerge(): void {
  mergeOpenFor.value = null;
  mergeSearch.value = '';
  mergeHits.value = [];
}
async function pickMergeTarget(hit: AssetAutocompleteHit): Promise<void> {
  if (!mergeOpenFor.value) return;
  const r = await merge(mergeOpenFor.value, hit.id);
  if (r) {
    showToast(`Merged ${r.name} → ${hit.name}`, 'success');
    closeMerge();
  } else {
    showToast('Merge failed', 'error');
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

function reportStatusTone(s: ScanReportStatus): string {
  if (s === 'pending') return 'text-signal';
  if (s === 'reviewed') return 'text-sev-low';
  return 'text-sev-crit';
}

function discoveredStatusTone(s: DiscoveredAsset['status']): string {
  if (s === 'pending') return 'text-signal';
  if (s === 'merged_to_existing') return 'text-sev-low';
  if (s === 'created_new') return 'text-sev-low';
  return 'text-sev-crit'; // rejected
}

function discoveredStatusLabel(s: DiscoveredAsset['status']): string {
  if (s === 'pending') return 'pending';
  if (s === 'merged_to_existing') return 'merged';
  if (s === 'created_new') return 'created';
  return 'rejected';
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1200px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'inventory inbox' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        inventory · review queue
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">Inventory inbox</h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Discovered assets from <RouterLink to="/admin/scanners" class="text-signal hover:underline">scanner agents</RouterLink>
        await review. Merge to an existing asset, accept as new (creates a real
        Asset row), or reject. Reports auto-mark reviewed when no items remain pending.
      </p>
    </header>

    <!-- Filter -->
    <div class="mb-6 flex items-center gap-3 font-mono text-[11px]">
      <span class="text-ink-faint">filter</span>
      <button v-for="s in ['pending', 'reviewed', 'rejected', '']" :key="s"
        type="button"
        :class="['transition', filterStatus === s ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
        @click="filterStatus = s as ScanReportStatus | ''"
      >{{ s || 'all' }}</button>
    </div>

    <div class="grid grid-cols-12 gap-6">
      <!-- Reports list (left) -->
      <aside class="col-span-4">
        <div class="flex items-baseline gap-3 mb-3">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">reports · {{ reports.length }}</h2>
          <div class="flex-1 border-b border-rule" />
        </div>
        <p v-if="loadingReports && reports.length === 0" class="text-[12px] text-ink-faint">loading…</p>
        <p v-else-if="reports.length === 0" class="text-[12px] text-ink-faint italic">no reports.</p>
        <ul v-else class="space-y-1.5">
          <li v-for="r in reports" :key="r.id">
            <button
              type="button"
              class="w-full text-left border rounded-md px-3 py-2 transition"
              :class="r.id === selectedReportId
                ? 'border-signal/40 bg-signal/5'
                : 'border-rule bg-surface/20 hover:bg-surface/40'"
              @click="selectReport(r)"
            >
              <div class="flex items-baseline justify-between gap-2 mb-1">
                <span class="text-[12px] text-ink truncate">{{ r.scannerLabel ?? '—' }}</span>
                <span class="font-mono text-[10px] uppercase tracking-wider" :class="reportStatusTone(r.status)">{{ r.status }}</span>
              </div>
              <p class="font-mono text-[10px] text-ink-faint">
                {{ r.itemCount }} item{{ r.itemCount === 1 ? '' : 's' }} · {{ fmtDate(r.ts) }}
              </p>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Items detail (right) -->
      <section class="col-span-8">
        <div class="flex items-baseline gap-3 mb-3">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            <template v-if="selectedReportId">discovered · {{ items.length }}</template>
            <template v-else>select a report</template>
          </h2>
          <div class="flex-1 border-b border-rule" />
        </div>

        <p v-if="!selectedReportId" class="text-[12px] text-ink-faint italic">pick a report from the left.</p>
        <p v-else-if="loadingItems && items.length === 0" class="text-[12px] text-ink-faint">loading…</p>
        <template v-else>
          <p v-if="pendingItems.length === 0 && items.length === 0" class="text-[12px] text-ink-faint italic">no items.</p>

          <!-- Pending -->
          <ul v-if="pendingItems.length" class="space-y-2 mb-6">
            <li v-for="d in pendingItems" :key="d.id" class="border border-signal/30 rounded-md p-3 bg-signal/5">
              <div class="flex items-baseline justify-between gap-3 mb-2">
                <div class="flex items-baseline gap-3">
                  <span class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">{{ d.kind }}</span>
                  <span class="text-[13px] text-ink">{{ d.name }}</span>
                  <span v-if="d.hostname" class="font-mono text-[10px] text-ink-faint">{{ d.hostname }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Button variant="ghost" size="sm" :loading="submitting" @click="openMerge(d)">Merge…</Button>
                  <Button variant="primary" size="sm" :loading="submitting" @click="onAccept(d)">Accept new</Button>
                  <button type="button" class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-sev-crit transition" :disabled="submitting" @click="onReject(d)">reject</button>
                </div>
              </div>
              <p v-if="d.ipAddresses.length" class="font-mono text-[10px] text-ink-faint">
                ips: {{ d.ipAddresses.join(', ') }}
              </p>
              <!-- Inline merge picker -->
              <div v-if="mergeOpenFor === d.id" class="mt-2 border-t border-rule pt-2">
                <input
                  v-model="mergeSearch"
                  placeholder="search existing asset by name…"
                  class="w-full px-2 py-1.5 bg-base/60 border border-rule rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                />
                <ul v-if="mergeHits.length" class="mt-1 max-h-[200px] overflow-y-auto border border-rule rounded">
                  <li v-for="h in mergeHits" :key="h.id"
                    class="px-3 py-1.5 text-[12px] hover:bg-rule cursor-pointer flex items-baseline justify-between gap-2"
                    @click="pickMergeTarget(h)"
                  >
                    <span class="text-ink">{{ h.name }}</span>
                    <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ h.kind }}</span>
                  </li>
                </ul>
                <p v-else-if="mergeSearch.trim().length >= 2" class="mt-1 font-mono text-[10px] text-ink-faint">no matches</p>
                <button type="button" class="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink transition" @click="closeMerge">cancel merge</button>
              </div>
            </li>
          </ul>

          <!-- Reviewed -->
          <details v-if="reviewedItems.length" class="border border-rule rounded">
            <summary class="px-3 py-2 cursor-pointer font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-ink transition">
              reviewed · {{ reviewedItems.length }}
            </summary>
            <ul class="space-y-1 px-3 py-2">
              <li v-for="d in reviewedItems" :key="d.id" class="flex items-baseline justify-between gap-3 text-[12px] py-1">
                <div class="flex items-baseline gap-2">
                  <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ d.kind }}</span>
                  <span class="text-ink-dim">{{ d.name }}</span>
                </div>
                <span class="font-mono text-[10px] uppercase tracking-wider" :class="discoveredStatusTone(d.status)">
                  {{ discoveredStatusLabel(d.status) }}
                  <template v-if="d.matchedAssetId"> · {{ d.matchedAssetId.slice(0, 8) }}</template>
                </span>
              </li>
            </ul>
          </details>
        </template>
      </section>
    </div>
  </div>
</template>
