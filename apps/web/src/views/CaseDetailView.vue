<script setup lang="ts">
import { ref, toRef, computed } from 'vue';
import { useCase, useCloseCase } from '@/composables/useCase';
import { useToast } from '@/composables/useToast';
import type { CloseVerdict } from '@/composables/case-kinds';
import CaseStatusBadge from '@/components/case/CaseStatusBadge.vue';
import CaseVerdictBadge from '@/components/case/CaseVerdictBadge.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';
import CloseCaseModal from '@/components/case/CloseCaseModal.vue';
import NotesPanel from '@/components/notes/NotesPanel.vue';
import AddIocArtifactModal from '@/components/case/AddIocArtifactModal.vue';
import { useCreateIocArtifact, type IocArtifactInput } from '@/composables/useArtifacts';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const { case: caseDetail, loading, error, refetch } = useCase(() => idRef.value);

const closeOpen = ref(false);
const { submit: submitClose, loading: closeLoading } = useCloseCase();
const { show: showToast } = useToast();

async function onCloseCase(verdict: CloseVerdict): Promise<void> {
  if (!caseDetail.value) return;
  const r = await submitClose(caseDetail.value.id, verdict);
  if (r.ok) {
    closeOpen.value = false;
    showToast(`Case closed: ${verdict.toLowerCase()}`, 'success');
    refetch();
  } else {
    showToast(r.error ?? 'close failed', 'error');
  }
}

// Add IOC artifact (single, manual). Bulk-paste covers many; this is
// the 1-at-a-time form.
const addIocOpen = ref(false);
const { submit: createIoc, submitting: creatingIoc } = useCreateIocArtifact();
async function onAddIoc(input: IocArtifactInput): Promise<void> {
  if (!caseDetail.value) return;
  const r = await createIoc(caseDetail.value.id, input);
  if (r) {
    showToast(`Added IOC ${r.value}`, 'success');
    addIocOpen.value = false;
  } else {
    showToast('Add IOC failed', 'error');
  }
}

type Tab = 'summary' | 'artifacts';
const activeTab = ref<Tab>('summary');

const counts = computed(() => caseDetail.value?.artifactsByType ?? {
  ioc: 0, file: 0, process: 0, network: 0, registry: 0, persistence: 0,
  account: 0, logFinding: 0, memory: 0, detectionHit: 0, note: 0,
});

const nonZeroCounts = computed(() =>
  Object.entries(counts.value).filter(([, n]) => n > 0) as Array<[string, number]>,
);

const labelMap: Record<string, string> = {
  ioc: 'IOC',
  file: 'File',
  process: 'Process',
  network: 'Network',
  registry: 'Registry',
  persistence: 'Persistence',
  account: 'Account',
  logFinding: 'Log Finding',
  memory: 'Memory',
  detectionHit: 'Detection Hit',
  note: 'Note',
};
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'cases', to: '/cases' },
          { label: caseDetail?.reportNo ?? 'Loading…', mono: true },
        ]"
        class="mb-3"
      />
      <div v-if="caseDetail" class="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p class="font-mono text-[14px] text-ink">{{ caseDetail.reportNo }}</p>
          <h1 v-if="caseDetail.title" class="text-[22px] text-ink mt-1 font-medium tracking-tight">
            {{ caseDetail.title }}
          </h1>
          <p class="text-ink-dim text-[13px] mt-1">
            {{ caseDetail.stakeholder.name }} · {{ caseDetail.stakeholder.city ?? 'no city' }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <CaseStatusBadge :status="caseDetail.status" />
          <CaseVerdictBadge :verdict="caseDetail.verdict" />
          <RouterLink
            :to="{ name: 'graph', query: { seed: `case:${caseDetail.id}` } }"
            class="font-mono text-[11px] text-signal hover:underline ml-1"
          >Open in graph →</RouterLink>
          <Button v-if="caseDetail.status === 'ACTIVE'" variant="ghost" @click="addIocOpen = true">
            + Add IOC
          </Button>
          <Button v-if="caseDetail.status === 'ACTIVE'" variant="primary" @click="closeOpen = true">
            Close case
          </Button>
        </div>
      </div>
    </header>

    <p v-if="loading && !caseDetail" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>
    <p v-else-if="!caseDetail" class="text-[13px] text-ink-dim">case not found.</p>

    <template v-else>
      <!-- 2 tabs only: Summary + Artifacts -->
      <nav class="flex items-center gap-6 border-b border-rule mb-6 font-mono text-[11px] uppercase tracking-wider">
        <button
          v-for="t in (['summary', 'artifacts'] as const)"
          :key="t"
          type="button"
          :class="[
            'py-2 -mb-px border-b-2 transition',
            activeTab === t
              ? 'text-ink border-signal'
              : 'text-ink-faint border-transparent hover:text-ink-dim',
          ]"
          @click="activeTab = t"
        >
          {{ t }}
          <span v-if="t === 'artifacts'" class="ml-1 text-ink-faint">{{ caseDetail.artifactCount }}</span>
        </button>
      </nav>

      <!-- Summary tab -->
      <section v-if="activeTab === 'summary'" class="space-y-6">
        <div v-if="caseDetail.trigger">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">trigger</p>
          <p class="text-ink leading-6">{{ caseDetail.trigger }}</p>
        </div>
        <div v-if="caseDetail.summary">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">summary</p>
          <p class="text-ink-dim leading-6 whitespace-pre-line max-w-[68ch]">{{ caseDetail.summary }}</p>
        </div>
        <div class="grid grid-cols-3 gap-x-12 gap-y-4 pt-6 border-t border-rule">
          <div>
            <p class="font-mono text-[10px] text-ink-faint">deployed</p>
            <p class="font-mono text-ink mt-1">{{ caseDetail.deployedAt.slice(0, 10) }}</p>
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">closed</p>
            <p class="font-mono text-ink mt-1">{{ caseDetail.closedAt?.slice(0, 10) ?? '—' }}</p>
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">total artifacts</p>
            <p class="font-mono text-ink mt-1 tabular-nums">{{ caseDetail.artifactCount }}</p>
          </div>
        </div>
      </section>

      <!-- Artifacts tab — smart empty state -->
      <section v-else>
        <div v-if="caseDetail.artifactCount === 0" class="py-12 text-center">
          <p class="text-ink-dim text-[14px] mb-2">No artifacts yet</p>
          <p class="font-mono text-[12px] text-ink-faint italic">
            Per-type artifact create forms (11 types) shipping in UI v2.
            Backend ready — see <span class="font-mono">apps/backend/src/artifacts/</span>.
          </p>
        </div>
        <div v-else class="grid grid-cols-4 gap-4">
          <div
            v-for="[key, n] in nonZeroCounts"
            :key="key"
            class="border border-rule rounded-md p-4"
          >
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {{ labelMap[key] ?? key }}
            </p>
            <p class="font-mono text-[24px] text-ink mt-2 tabular-nums">{{ n }}</p>
          </div>
        </div>
      </section>

      <div class="mt-12">
        <NotesPanel entity-type="Case" :entity-id="caseDetail.id" />
      </div>
    </template>

    <AddIocArtifactModal
      :open="addIocOpen"
      :loading="creatingIoc"
      @submit="onAddIoc"
      @cancel="addIocOpen = false"
    />

    <CloseCaseModal
      :open="closeOpen"
      :loading="closeLoading"
      @submit="onCloseCase"
      @cancel="closeOpen = false"
    />
  </div>
</template>
