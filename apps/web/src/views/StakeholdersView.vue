<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import {
  useStakeholders, useSektors, useCreateStakeholder, useBulkImportStakeholders,
  type StakeholdersFilter, type StakeholderInput,
} from '@/composables/useStakeholders';
import SensorStatusPill from '@/components/stakeholder/SensorStatusPill.vue';
import SektorBadge from '@/components/stakeholder/SektorBadge.vue';
import CreateStakeholderSlide from '@/components/reconciliation/CreateStakeholderSlide.vue';
import StakeholderImportModal from '@/components/stakeholder/StakeholderImportModal.vue';
import Button from '@/components/ui/Button.vue';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();

// Search: two-ref pattern — searchInput bound to <input>, search is debounced
const searchInput = ref<string>((route.query.q as string) ?? '');
const search = ref<string>((route.query.q as string) ?? '');
const updateSearch = useDebounceFn((v: string) => { search.value = v; }, 300);
watch(searchInput, (v) => updateSearch(v));

const sektorSlugFilter = ref<string>((route.query.sektor as string) ?? '');
const statusFilter = ref<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');

const { sektors } = useSektors();
const sektorIdBySlug = computed(() => {
  const map: Record<string, string> = {};
  for (const s of sektors.value) map[s.slug] = s.id;
  return map;
});

const filter = computed<StakeholdersFilter>(() => ({
  sektorId: sektorSlugFilter.value && sektorIdBySlug.value[sektorSlugFilter.value]
    ? sektorIdBySlug.value[sektorSlugFilter.value]
    : null,
  status: statusFilter.value === 'ALL' ? null : statusFilter.value,
  search: search.value.trim() || null,
}));

const { stakeholders, loading, error, refetch } = useStakeholders(() => filter.value);

const filterActive = computed(() =>
  Boolean(search.value || sektorSlugFilter.value || statusFilter.value !== 'ACTIVE'),
);

function go(s: { id: string }): void {
  router.push({ name: 'stakeholder-detail', params: { id: s.id } });
}

const auth = useAuthStore();
const canCreate = computed(() => auth.hasMinRole('ANALYST'));

const { show: showToast } = useToast();
const { submit: createStakeholder, loading: creating } = useCreateStakeholder();
const slideOpen = ref(false);

async function onCreateSubmit(input: StakeholderInput): Promise<void> {
  try {
    const created = await createStakeholder(input);
    if (!created) {
      showToast('create failed', 'error');
      return;
    }
    slideOpen.value = false;
    showToast(`created → ${created.name}`, 'success');
    refetch();
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'create failed', 'error');
  }
}

// CSV bulk import. Modal stays open after submit so the operator can
// review the per-line error report; the modal exposes setResult().
const importOpen = ref(false);
const importModal = ref<InstanceType<typeof StakeholderImportModal> | null>(null);
const { submit: bulkImport, loading: importing } = useBulkImportStakeholders();

async function onImportSubmit(csv: string): Promise<void> {
  const r = await bulkImport(csv);
  if (!r) {
    showToast('import failed', 'error');
    return;
  }
  importModal.value?.setResult(r);
  if (r.created > 0) {
    showToast(`imported ${r.created} stakeholder${r.created === 1 ? '' : 's'}`, 'success');
    refetch();
  } else if (r.errors.length > 0) {
    showToast(`no rows imported — ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}`, 'error');
  } else {
    showToast('nothing new — all rows already exist', 'success');
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1400px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <div class="flex items-baseline justify-between gap-6">
        <div>
          <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">inventory</p>
          <h1 class="text-[22px] font-medium text-ink mt-1">Stakeholders</h1>
        </div>
        <div class="flex items-center gap-5">
          <p class="font-mono text-[11px] text-ink-dim tabular-nums">
            {{ loading ? '…' : stakeholders.length }} entities
          </p>
          <Button v-if="canCreate" variant="ghost" @click="importOpen = true">Import CSV</Button>
          <Button v-if="canCreate" variant="primary" @click="slideOpen = true">+ New Stakeholder</Button>
        </div>
      </div>
    </header>

    <StakeholderImportModal
      ref="importModal"
      :open="importOpen"
      :loading="importing"
      @submit="onImportSubmit"
      @cancel="importOpen = false"
    />

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
        v-model="searchInput"
        type="search"
        placeholder="name or alias substring"
        class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-dim py-1 w-full max-w-xs transition"
      />
      <select
        v-model="sektorSlugFilter"
        class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink"
      >
        <option value="">All sektors</option>
        <option v-for="s in sektors" :key="s.id" :value="s.slug">
          {{ s.name }} ({{ s.stakeholderCount }})
        </option>
      </select>
      <div class="flex items-center gap-2 font-mono text-[11px]">
        <button
          v-for="s in (['ACTIVE', 'ARCHIVED', 'ALL'] as const)"
          :key="s"
          type="button"
          :class="['px-2 py-1 transition', statusFilter === s ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
          @click="statusFilter = s"
        >{{ s.toLowerCase() }}</button>
      </div>
    </div>

    <!-- Table -->
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule-strong">
          <th class="py-2">name</th>
          <th class="py-2">sektor</th>
          <th class="py-2">city</th>
          <th class="py-2">sensor</th>
          <th class="py-2">slug</th>
          <th class="py-2 text-right">aliases</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in stakeholders"
          :key="s.id"
          class="border-b border-rule hover:bg-surface/40 cursor-pointer transition"
          @click="go(s)"
        >
          <td class="py-3 text-ink">{{ s.name }}</td>
          <td class="py-3"><SektorBadge :sektor="s.sektor" /></td>
          <td class="py-3 text-ink-dim text-[13px]">{{ s.city ?? '—' }}</td>
          <td class="py-3"><SensorStatusPill :status="s.sensor.status" /></td>
          <td class="py-3 font-mono text-[12px] text-ink-faint">{{ s.slug }}</td>
          <td class="py-3 text-right font-mono text-[10px] text-ink-faint">
            {{ s.aliases.length ? s.aliases.length + ' alias' + (s.aliases.length === 1 ? '' : 'es') : '—' }}
          </td>
        </tr>
        <tr v-if="!loading && stakeholders.length === 0">
          <td colspan="6" class="py-12 text-center text-ink-dim text-[13px]">
            <template v-if="filterActive">No stakeholders match your filter — clear filters to see all.</template>
            <template v-else>No stakeholders yet — run reconciliation inbox to populate from ELK.</template>
          </td>
        </tr>
      </tbody>
    </table>

    <CreateStakeholderSlide
      :raw="null"
      :loading="creating"
      :open="slideOpen"
      @submit="onCreateSubmit"
      @cancel="slideOpen = false"
    />
  </div>
</template>
