<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useCases, type CaseStatus, type CasesFilter } from '@/composables/useCases';
import CaseStatusBadge from '@/components/case/CaseStatusBadge.vue';
import CaseVerdictBadge from '@/components/case/CaseVerdictBadge.vue';
import Button from '@/components/ui/Button.vue';

const router = useRouter();

const PAGE_SIZE = 100;
const offset = ref(0);
const search = ref('');
const debouncedSearch = ref('');
const statusFilter = ref<CaseStatus[]>(['DRAFT', 'ACTIVE']);

const setDebouncedSearch = useDebounceFn((val: string) => {
  debouncedSearch.value = val;
}, 300);

watch(search, (val) => setDebouncedSearch(val));

// Reset offset when filter changes
watch([debouncedSearch, statusFilter], () => { offset.value = 0; });

const filter = computed<CasesFilter>(() => ({
  search: debouncedSearch.value.trim() || null,
  status: statusFilter.value.length > 0 ? statusFilter.value : null,
  offset: offset.value,
}));

const { cases, loading } = useCases(() => filter.value);

// filterActive: anything outside the default DRAFT+ACTIVE selection or non-empty search
const filterActive = computed(() =>
  Boolean(
    debouncedSearch.value ||
    statusFilter.value.length !== 2 ||
    statusFilter.value.some((s) => !['DRAFT', 'ACTIVE'].includes(s)),
  ),
);

function go(c: { id: string }): void {
  router.push({ name: 'case-detail', params: { id: c.id } });
}

const ALL_STATUSES: CaseStatus[] = ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'];
function toggleStatus(s: CaseStatus): void {
  const i = statusFilter.value.indexOf(s);
  if (i >= 0) statusFilter.value.splice(i, 1);
  else statusFilter.value.push(s);
}

function nextPage(): void {
  if (cases.value.length === PAGE_SIZE) offset.value += PAGE_SIZE;
}
function prevPage(): void {
  offset.value = Math.max(0, offset.value - PAGE_SIZE);
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1400px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8 flex items-baseline justify-between">
      <div>
        <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">compromise assessment</p>
        <h1 class="text-[22px] font-medium text-ink mt-1">Cases</h1>
      </div>
      <Button variant="primary" @click="router.push({ name: 'case-new' })">+ New Case</Button>
    </header>

    <div class="flex flex-wrap items-center gap-4 mb-6">
      <input
        v-model="search"
        type="search"
        placeholder="reportNo / title / trigger"
        class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-dim py-1 w-full max-w-xs transition"
      />
      <div class="flex items-center gap-2 font-mono text-[11px]">
        <button
          v-for="s in ALL_STATUSES"
          :key="s"
          type="button"
          :class="['px-2 py-1 transition border-b-2', statusFilter.includes(s) ? 'text-ink border-signal' : 'text-ink-faint border-transparent hover:text-ink-dim']"
          @click="toggleStatus(s)"
        >{{ s.toLowerCase() }}</button>
      </div>
    </div>

    <table class="w-full text-sm">
      <thead>
        <tr class="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule-strong">
          <th class="py-2">report no</th>
          <th class="py-2">stakeholder</th>
          <th class="py-2">city</th>
          <th class="py-2">status</th>
          <th class="py-2">verdict</th>
          <th class="py-2 text-right">artifacts</th>
          <th class="py-2 text-right">deployed</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="c in cases"
          :key="c.id"
          class="border-b border-rule hover:bg-surface/40 cursor-pointer transition"
          @click="go(c)"
        >
          <td class="py-3 font-mono text-[12px] text-ink">{{ c.reportNo }}</td>
          <td class="py-3 text-ink">{{ c.stakeholder.name }}</td>
          <td class="py-3 text-ink-dim text-[13px]">{{ c.stakeholder.city ?? '—' }}</td>
          <td class="py-3"><CaseStatusBadge :status="c.status" /></td>
          <td class="py-3"><CaseVerdictBadge :verdict="c.verdict" /></td>
          <td class="py-3 text-right font-mono text-[12px] text-ink-dim tabular-nums">{{ c.artifactCount }}</td>
          <td class="py-3 text-right font-mono text-[10px] text-ink-faint">{{ c.deployedAt.slice(0, 10) }}</td>
        </tr>
        <tr v-if="!loading && cases.length === 0">
          <td colspan="7" class="py-12 text-center text-ink-dim text-[13px]">
            <template v-if="filterActive">No cases match your filter — adjust status filter or clear search.</template>
            <template v-else>No cases yet. Click "+ New Case" to start.</template>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex items-center justify-between mt-6 font-mono text-[11px] text-ink-dim">
      <span>showing {{ offset + 1 }}–{{ offset + cases.length }}</span>
      <div class="flex gap-2">
        <button
          :disabled="offset === 0"
          @click="prevPage"
          class="px-2 py-1 text-ink-faint hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
        >← prev</button>
        <button
          :disabled="cases.length < PAGE_SIZE"
          @click="nextPage"
          class="px-2 py-1 text-ink-faint hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
        >next →</button>
      </div>
    </div>
  </div>
</template>
