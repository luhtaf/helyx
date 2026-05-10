<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useRules, type RuleFilter, type RuleKind, type RuleStatus, type RuleSource } from '@/composables/useRules';

const route = useRoute();
const router = useRouter();

const page = computed(() => Number(route.query.page) || 1);
const perPage = 25;
const searchInput = ref<string>((route.query.q as string) ?? '');
const search = ref<string>(searchInput.value);
const updateSearch = useDebounceFn((v: string) => { search.value = v; }, 300);
watch(searchInput, (v) => updateSearch(v));

const kindFilter = ref<RuleKind | ''>('');
const statusFilter = ref<RuleStatus | ''>('');
const sourceFilter = ref<RuleSource | ''>('');

const filter = computed<RuleFilter>(() => ({
  kind: kindFilter.value || null,
  status: statusFilter.value || null,
  source: sourceFilter.value || null,
  search: search.value.trim() || null,
}));

const { data, loading, error } = useRules({
  filter: () => filter.value,
  page: () => page.value,
  perPage: () => perPage,
});

const filterActive = computed(() =>
  Boolean(kindFilter.value || statusFilter.value || sourceFilter.value || search.value),
);
function clearFilters(): void {
  kindFilter.value = '';
  statusFilter.value = '';
  sourceFilter.value = '';
  searchInput.value = '';
  search.value = '';
}

function go(r: { id: string }): void {
  router.push({ name: 'rule-detail', params: { id: r.id } });
}

function kindClass(k: RuleKind): string {
  switch (k) {
    case 'YARA':     return 'text-sev-high';
    case 'SURICATA': return 'text-sev-med';
    case 'SIGMA':    return 'text-sev-low';
    case 'OWASP':    return 'text-signal';
    case 'CUSTOM':   return 'text-ink-dim';
  }
}
function statusClass(s: RuleStatus): string {
  switch (s) {
    case 'ACTIVE':     return 'text-sev-low';
    case 'DRAFT':      return 'text-ink-dim';
    case 'DEPRECATED': return 'text-ink-faint';
  }
}
function sourceLabel(s: RuleSource): string {
  return s.replace(/_/g, ' ');
}

const KIND_OPTIONS: RuleKind[] = ['YARA', 'SURICATA', 'SIGMA', 'OWASP', 'CUSTOM'];
const STATUS_OPTIONS: RuleStatus[] = ['ACTIVE', 'DRAFT', 'DEPRECATED'];
const SOURCE_OPTIONS: RuleSource[] = ['manual', 'sigma_community', 'otx', 'helyx_generated', 'imported_stix', 'imported_openioc'];
</script>

<template>
  <div class="px-12 py-10 max-w-[1400px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <div class="flex items-baseline justify-between gap-6">
        <div>
          <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">detection</p>
          <h1 class="text-[22px] font-medium text-ink mt-1">Rules</h1>
        </div>
        <p class="font-mono text-[11px] text-ink-dim tabular-nums">
          {{ loading && !data ? '…' : `${data?.total ?? 0} rules` }}
        </p>
      </div>
    </header>

    <div
      v-if="error"
      class="border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-[12px] text-sev-crit rounded-md mb-4"
    >Failed to load: {{ error.message }}</div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <input
        v-model="searchInput"
        type="search"
        placeholder="search rule name or description"
        class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-dim py-1 w-full max-w-xs transition"
      />
      <select v-model="kindFilter" class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink">
        <option value="">all kinds</option>
        <option v-for="k in KIND_OPTIONS" :key="k" :value="k">{{ k.toLowerCase() }}</option>
      </select>
      <select v-model="statusFilter" class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink">
        <option value="">all status</option>
        <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ s.toLowerCase() }}</option>
      </select>
      <select v-model="sourceFilter" class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink">
        <option value="">all sources</option>
        <option v-for="s in SOURCE_OPTIONS" :key="s" :value="s">{{ sourceLabel(s) }}</option>
      </select>
      <button
        v-if="filterActive"
        type="button"
        class="font-mono text-[11px] text-ink-faint hover:text-ink-dim transition"
        @click="clearFilters"
      >clear</button>
    </div>

    <!-- Table -->
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule-strong">
          <th class="py-2 w-[80px]">kind</th>
          <th class="py-2">name</th>
          <th class="py-2">tags</th>
          <th class="py-2 w-[140px]">source</th>
          <th class="py-2 w-[80px]">status</th>
          <th class="py-2 w-[80px] text-right">techs</th>
          <th class="py-2 w-[80px] text-right">hunts</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in data?.items"
          :key="r.id"
          class="border-b border-rule hover:bg-surface/40 cursor-pointer transition"
          @click="go(r)"
        >
          <td class="py-3">
            <span :class="['font-mono text-[10px] uppercase tracking-wider', kindClass(r.kind)]">{{ r.kind }}</span>
          </td>
          <td class="py-3">
            <p class="text-ink truncate max-w-[400px]">{{ r.name }}</p>
            <p v-if="r.description" class="text-[11px] text-ink-faint truncate max-w-[400px] mt-0.5">{{ r.description }}</p>
          </td>
          <td class="py-3">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="t in r.tags.slice(0, 3)"
                :key="t"
                class="inline-flex px-1.5 py-0.5 rounded-sm border border-rule text-ink-faint font-mono text-[10px]"
              >{{ t }}</span>
              <span v-if="r.tags.length > 3" class="font-mono text-[10px] text-ink-faint">+{{ r.tags.length - 3 }}</span>
            </div>
          </td>
          <td class="py-3 font-mono text-[11px] text-ink-dim">{{ sourceLabel(r.source) }}</td>
          <td class="py-3"><span :class="['font-mono text-[10px] uppercase tracking-wider', statusClass(r.status)]">{{ r.status }}</span></td>
          <td class="py-3 text-right font-mono text-[11px] text-ink-dim tabular-nums">{{ r.detectsTechniqueCount }}</td>
          <td class="py-3 text-right font-mono text-[11px] text-ink-dim tabular-nums">{{ r.generatedByHuntCount }}</td>
        </tr>
        <tr v-if="!loading && (data?.items.length ?? 0) === 0">
          <td colspan="7" class="py-12 text-center text-ink-dim text-[13px]">
            <template v-if="filterActive">No rules match your filter — clear filters to see all.</template>
            <template v-else>No rules yet — seed Sigma baseline via <code class="font-mono">pnpm rules:seed-sigma</code></template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
