<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useStakeholders } from '@/composables/useStakeholders';
import { useCreateCase, type CaseInput } from '@/composables/useCases';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const router = useRouter();

const error = ref<string | null>(null);

// Stakeholder picker (debounced search)
const stakeholderSearchInput = ref('');
const stakeholderSearch = ref('');
const updateSearch = useDebounceFn((v: string) => { stakeholderSearch.value = v; }, 300);
watch(stakeholderSearchInput, (v) => updateSearch(v));

const selectedStakeholderId = ref<string | null>(null);
const { stakeholders, loading: loadingPicker } = useStakeholders(() => ({
  search: stakeholderSearch.value.trim() || null,
  status: 'ACTIVE',
}));
const selectedStakeholder = computed(() =>
  stakeholders.value.find((s) => s.id === selectedStakeholderId.value) ?? null,
);

// Form state
const reportNo = ref('');
const title = ref('');
const trigger = ref('');
const summary = ref('');
// TODO: replace with user picker when users(orgId) query lands
const leadUserId = ref('');
// Stored as UTC midnight per project convention; displayed as date-only (slice(0,10))
const deployedAt = ref(new Date().toISOString().slice(0, 10));

const { submit, loading } = useCreateCase();

async function onSubmit(): Promise<void> {
  error.value = null;
  if (!selectedStakeholderId.value) {
    error.value = 'Pick a stakeholder first';
    return;
  }
  if (!reportNo.value.trim()) {
    error.value = 'reportNo is required';
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deployedAt.value)) {
    error.value = 'deployedAt must be YYYY-MM-DD';
    return;
  }
  const input: CaseInput = {
    reportNo: reportNo.value.trim(),
    title: title.value.trim() || undefined,
    trigger: trigger.value.trim() || undefined,
    summary: summary.value.trim() || undefined,
    stakeholderId: selectedStakeholderId.value,
    leadUserId: leadUserId.value.trim() || undefined,
    deployedAt: new Date(deployedAt.value + 'T00:00:00Z').toISOString(),
    status: 'DRAFT',
  };
  try {
    const created = await submit(input);
    if (created) router.push({ name: 'case-detail', params: { id: created.id } });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[760px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">compromise assessment / new</p>
      <h1 class="text-[22px] font-medium text-ink mt-1">New Case</h1>
    </header>

    <form class="space-y-6" @submit.prevent="onSubmit">
      <!-- Stakeholder picker -->
      <section>
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">stakeholder</p>
        <Input v-model="stakeholderSearchInput" type="search" placeholder="search by name…" />
        <ul class="mt-3 space-y-1 max-h-[280px] overflow-y-auto border border-rule rounded-md">
          <li v-if="loadingPicker" class="px-3 py-2 text-ink-dim text-[12px] italic">searching…</li>
          <li
            v-else-if="stakeholders.length === 0"
            class="px-3 py-2 text-ink-faint text-[12px] italic"
          >
            no active stakeholders match — clear search or run reconciliation inbox
          </li>
          <li
            v-for="s in stakeholders"
            :key="s.id"
            :class="[
              'flex items-baseline justify-between px-3 py-2 cursor-pointer transition border-l-2',
              selectedStakeholderId === s.id
                ? 'bg-surface border-signal'
                : 'border-transparent hover:bg-surface/40',
            ]"
            @click="selectedStakeholderId = s.id"
          >
            <div>
              <p class="text-ink">{{ s.name }}</p>
              <p class="font-mono text-[10px] text-ink-faint">{{ s.slug }} · {{ s.city ?? 'no city' }}</p>
            </div>
            <span v-if="s.sektor" class="font-mono text-[10px] text-ink-dim">{{ s.sektor.slug }}</span>
          </li>
        </ul>
        <p v-if="selectedStakeholder" class="mt-2 font-mono text-[11px] text-signal">
          selected: {{ selectedStakeholder.name }}
        </p>
      </section>

      <!-- Metadata -->
      <section class="space-y-4 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">metadata</p>
        <Input v-model="reportNo" label="Report No" required placeholder="001/CA/CTH/04/2026" />
        <Input v-model="title" label="Title" placeholder="optional" />
        <Input v-model="trigger" label="Trigger" placeholder="why this case" />
        <label class="block">
          <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Summary</span>
          <textarea
            v-model="summary"
            rows="4"
            class="block w-full rounded-md border border-rule-strong bg-surface p-3 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:ring-1 focus:ring-signal/30"
          />
        </label>
        <!-- TODO: replace with user picker when users(orgId) query lands -->
        <Input v-model="leadUserId" label="Lead User ID (optional, paste UUID)" placeholder="leave empty if no lead yet" />
        <label class="block">
          <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Deployed at</span>
          <input
            v-model="deployedAt"
            type="date"
            required
            class="block h-9 w-full rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal/30"
          />
        </label>
      </section>

      <p v-if="error" class="text-sev-crit text-[12px]">{{ error }}</p>

      <footer class="flex items-center gap-3 pt-4 border-t border-rule">
        <Button type="submit" variant="primary" :loading="loading">Create case</Button>
        <Button type="button" variant="ghost" @click="router.push({ name: 'cases' })">Cancel</Button>
      </footer>
    </form>
  </div>
</template>
