<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useSensorCoverage, type SensorStatusFilter, type SensorStackFilter } from '@/composables/useSensorCoverage';
import SensorStatusPill from '@/components/stakeholder/SensorStatusPill.vue';
import SektorBadge from '@/components/stakeholder/SektorBadge.vue';

const router = useRouter();

const statusFilter = ref<SensorStatusFilter>('ALL');
const stackFilter = ref<SensorStackFilter>('ALL');
const searchInput = ref('');
const search = ref('');
const updateSearch = useDebounceFn((v: string) => { search.value = v; }, 300);
const onSearchInput = (v: string): void => { searchInput.value = v; updateSearch(v); };

const filter = computed(() => ({
  status: statusFilter.value,
  stack: stackFilter.value,
  search: search.value,
}));

const { stakeholders, counts, loading, error } = useSensorCoverage(() => filter.value);

const filterActive = computed(() =>
  statusFilter.value !== 'ALL' || stackFilter.value !== 'ALL' || Boolean(search.value),
);

function go(s: { id: string }): void {
  router.push({ name: 'stakeholder-detail', params: { id: s.id } });
}

function clearFilters(): void {
  statusFilter.value = 'ALL';
  stackFilter.value = 'ALL';
  searchInput.value = '';
  search.value = '';
}

const STATUS_OPTIONS: { value: SensorStatusFilter; label: string; tone?: string }[] = [
  { value: 'ALL', label: 'all' },
  { value: 'ONLINE', label: 'online', tone: 'sev-low' },
  { value: 'DEGRADED', label: 'degraded', tone: 'sev-med' },
  { value: 'OFFLINE', label: 'offline', tone: 'sev-crit' },
  { value: 'NO_SENSOR', label: 'no sensor' },
];

const STACK_OPTIONS: { value: SensorStackFilter; label: string }[] = [
  { value: 'ALL', label: 'all stacks' },
  { value: 'WAZUH_FULL', label: 'Wazuh full' },
  { value: 'WAZUH_AGENT', label: 'Wazuh agent' },
  { value: 'ELK_FULL', label: 'ELK full' },
  { value: 'MIXED', label: 'mixed' },
  { value: 'NONE', label: 'no stack' },
];
</script>

<template>
  <div class="px-12 py-10 max-w-[1400px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-6">
      <div class="flex items-baseline justify-between gap-6">
        <div>
          <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">operations</p>
          <h1 class="text-[22px] font-medium text-ink mt-1">Sensor coverage</h1>
        </div>
        <p class="font-mono text-[11px] text-ink-dim tabular-nums">
          {{ loading && counts.total === 0 ? '…' : `${stakeholders.length} of ${counts.total} stakeholders` }}
        </p>
      </div>
    </header>

    <!-- Aggregate counters -->
    <section class="mb-6 grid grid-cols-5 gap-4">
      <div class="border border-rule-strong rounded-md px-4 py-3">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">with sensor</p>
        <p class="font-mono text-[20px] text-ink mt-1 tabular-nums">{{ counts.withSensor }}</p>
        <p class="font-mono text-[10px] text-ink-faint mt-0.5">
          {{ counts.total ? Math.round((counts.withSensor / counts.total) * 100) : 0 }}% coverage
        </p>
      </div>
      <div class="border border-rule-strong rounded-md px-4 py-3">
        <p class="font-mono text-[10px] uppercase tracking-wider text-sev-low">online</p>
        <p class="font-mono text-[20px] text-sev-low mt-1 tabular-nums">{{ counts.online }}</p>
      </div>
      <div class="border border-rule-strong rounded-md px-4 py-3">
        <p class="font-mono text-[10px] uppercase tracking-wider text-sev-med">degraded</p>
        <p class="font-mono text-[20px] text-sev-med mt-1 tabular-nums">{{ counts.degraded }}</p>
      </div>
      <div class="border border-rule-strong rounded-md px-4 py-3">
        <p class="font-mono text-[10px] uppercase tracking-wider text-sev-crit">offline</p>
        <p class="font-mono text-[20px] text-sev-crit mt-1 tabular-nums">{{ counts.offline }}</p>
      </div>
      <div class="border border-rule-strong rounded-md px-4 py-3">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">no sensor</p>
        <p class="font-mono text-[20px] text-ink-dim mt-1 tabular-nums">{{ counts.noSensor }}</p>
      </div>
    </section>

    <!-- Stack breakdown -->
    <section v-if="Object.keys(counts.byStack).length" class="mb-6 flex flex-wrap items-baseline gap-3 font-mono text-[11px]">
      <span class="text-ink-faint uppercase tracking-wider text-[10px]">by stack:</span>
      <span v-for="(n, stack) in counts.byStack" :key="stack" class="text-ink-dim">
        {{ stack.toLowerCase() }} <span class="text-ink tabular-nums ml-1">{{ n }}</span>
      </span>
    </section>

    <!-- Error banner -->
    <div
      v-if="error"
      class="border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-[12px] text-sev-crit rounded-md mb-4"
    >
      Failed to load: {{ error.message }}
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <input
        :value="searchInput"
        type="search"
        placeholder="name or slug substring"
        class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-dim py-1 w-full max-w-xs transition"
        @input="onSearchInput(($event.target as HTMLInputElement).value)"
      />
      <select
        v-model="statusFilter"
        class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink"
      >
        <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <select
        v-model="stackFilter"
        class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink"
      >
        <option v-for="o in STACK_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button
        v-if="filterActive"
        type="button"
        class="font-mono text-[11px] text-ink-faint hover:text-ink-dim transition"
        @click="clearFilters"
      >clear filters</button>
    </div>

    <!-- Table -->
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule-strong">
          <th class="py-2">stakeholder</th>
          <th class="py-2">sektor</th>
          <th class="py-2">city</th>
          <th class="py-2">status</th>
          <th class="py-2">stack</th>
          <th class="py-2 text-right">agents</th>
          <th class="py-2">deployed</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in stakeholders"
          :key="s.id"
          class="border-b border-rule hover:bg-surface/40 cursor-pointer transition"
          @click="go(s)"
        >
          <td class="py-3">
            <p class="text-ink">{{ s.name }}</p>
            <p class="font-mono text-[10px] text-ink-faint">{{ s.slug }}</p>
          </td>
          <td class="py-3"><SektorBadge :sektor="s.sektor" /></td>
          <td class="py-3 text-ink-dim text-[13px]">{{ s.city ?? '—' }}</td>
          <td class="py-3"><SensorStatusPill :status="s.sensor.status" /></td>
          <td class="py-3 font-mono text-[11px] text-ink-dim">{{ s.sensor.stack ?? '—' }}</td>
          <td class="py-3 text-right font-mono text-[11px] text-ink-dim tabular-nums">{{ s.sensor.agentCount ?? '—' }}</td>
          <td class="py-3 font-mono text-[10px] text-ink-faint">{{ s.sensor.deployedAt?.slice(0, 10) ?? '—' }}</td>
        </tr>
        <tr v-if="!loading && stakeholders.length === 0">
          <td colspan="7" class="py-12 text-center text-ink-dim text-[13px]">
            <template v-if="filterActive">No stakeholders match your filter — clear filters to see all.</template>
            <template v-else>No sensor data yet.</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
