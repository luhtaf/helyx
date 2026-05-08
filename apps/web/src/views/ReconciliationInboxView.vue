<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import { useReconciliationInbox, type ReconciliationStatus } from '@/composables/useReconciliationInbox';
import RawStakeholderRow from '@/components/reconciliation/RawStakeholderRow.vue';
import CreateStakeholderSlide from '@/components/reconciliation/CreateStakeholderSlide.vue';
import { useToast } from '@/composables/useToast';
import type { StakeholderInput } from '@/composables/useStakeholders';

const router = useRouter();
const { show: showToast } = useToast();

const status = ref<ReconciliationStatus>('PENDING');
const focusIdx = ref(0);
const slideOpen = ref(false);
const loadingMutation = ref(false);

const {
  raws, counts, loading, refetch,
  resolve, reject, createFromRaw, recompute,
} = useReconciliationInbox(() => status.value);

const focused = computed(() => raws.value[focusIdx.value] ?? null);

watch(status, () => { focusIdx.value = 0; });

// FORBIDDEN handler — watch the list query error for access-denied redirect
const { error: listError } = useQuery(
  gql`query RawStakeholdersProbe($status: ReconciliationStatus = PENDING) {
    rawStakeholders(status: $status, first: 1) { id }
  }`,
  () => ({ status: status.value }),
  () => ({ fetchPolicy: 'cache-and-network' }),
);
watch(listError, (e) => {
  if (!e) return;
  const code = (e as unknown as { graphQLErrors?: { extensions?: { code?: string } }[] }).graphQLErrors?.[0]?.extensions?.code;
  if (code === 'FORBIDDEN') {
    showToast('Anda tidak punya izin (ADMIN required)', 'error');
    router.push({ name: 'dashboard', query: { reason: 'forbidden' } });
  }
});

async function pickSuggestion(idx: number): Promise<void> {
  const raw = focused.value;
  if (!raw) return;
  const suggestion = raw.suggestions[idx];
  if (!suggestion) {
    showToast(`no suggestion #${idx + 1}`, 'info');
    return;
  }
  loadingMutation.value = true;
  try {
    const r = await resolve(raw.id, suggestion.stakeholder.id);
    if (r.ok) {
      showToast(`resolved → ${suggestion.stakeholder.name}`, 'success');
      if (focusIdx.value >= raws.value.length - 1) focusIdx.value = Math.max(0, raws.value.length - 2);
    } else {
      showToast(r.error ?? 'resolve failed', 'error');
    }
  } finally {
    loadingMutation.value = false;
  }
}

async function rejectFocused(): Promise<void> {
  if (!focused.value) return;
  loadingMutation.value = true;
  try {
    const r = await reject(focused.value.id, 'noise');
    if (r.ok) {
      showToast('rejected', 'success');
      if (focusIdx.value >= raws.value.length - 1) focusIdx.value = Math.max(0, raws.value.length - 2);
    } else {
      showToast(r.error ?? 'reject failed', 'error');
    }
  } finally {
    loadingMutation.value = false;
  }
}

async function onCreateSubmit(input: StakeholderInput): Promise<void> {
  if (!focused.value) return;
  loadingMutation.value = true;
  try {
    const r = await createFromRaw(focused.value.id, input);
    if (r.ok) {
      slideOpen.value = false;
      showToast(`created + resolved → ${input.name}`, 'success');
      if (focusIdx.value >= raws.value.length - 1) focusIdx.value = Math.max(0, raws.value.length - 2);
    } else {
      showToast(r.error ?? 'create failed', 'error');
    }
  } finally {
    loadingMutation.value = false;
  }
}

async function recomputeAll(): Promise<void> {
  loadingMutation.value = true;
  try {
    const r = await recompute();
    if (r.ok) showToast(`recomputed ${r.count ?? 0} suggestions`, 'success');
    else showToast(r.error ?? 'recompute failed', 'error');
  } finally {
    loadingMutation.value = false;
  }
}

function onKeyDown(e: KeyboardEvent): void {
  // CRITICAL race guard — drop all keys while a mutation is in flight
  if (loadingMutation.value) return;
  if (slideOpen.value) return;
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;

  switch (e.key.toLowerCase()) {
    case 'j': case 'arrowdown':
      e.preventDefault();
      focusIdx.value = Math.min(raws.value.length - 1, focusIdx.value + 1);
      break;
    case 'k': case 'arrowup':
      e.preventDefault();
      focusIdx.value = Math.max(0, focusIdx.value - 1);
      break;
    case '1': case '2': case '3':
      e.preventDefault();
      pickSuggestion(Number(e.key) - 1);
      break;
    case 'n':
      e.preventDefault();
      slideOpen.value = true;
      break;
    case 's':
      e.preventDefault();
      focusIdx.value = Math.min(raws.value.length - 1, focusIdx.value + 1);
      showToast('skipped', 'info');
      break;
    case 'x':
      e.preventDefault();
      rejectFocused();
      break;
    case 'r':
      if (e.shiftKey) {
        e.preventDefault();
        recomputeAll();
      }
      break;
  }
}

function onVisibilityChange(): void {
  if (!document.hidden) refetch();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8 flex items-baseline justify-between">
      <div>
        <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">admin</p>
        <h1 class="text-[22px] font-medium text-ink mt-1">Reconciliation Inbox</h1>
      </div>
      <div class="flex items-baseline gap-6 font-mono text-[11px] text-ink-dim tabular-nums">
        <span>{{ counts.pending }} <span class="text-ink-faint">pending</span></span>
        <span>{{ counts.approved }} <span class="text-ink-faint">approved</span></span>
        <span>{{ counts.rejected }} <span class="text-ink-faint">rejected</span></span>
      </div>
    </header>

    <div class="flex items-center gap-4 mb-6 font-mono text-[11px]">
      <button
        v-for="s in (['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'] as const)"
        :key="s"
        type="button"
        :class="['px-2 py-1 transition', status === s ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
        @click="status = s"
      >{{ s.toLowerCase().replace('_', ' ') }}</button>
      <span class="ml-auto text-ink-faint text-[10px]">
        <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">⇧R</kbd> recompute
      </span>
    </div>

    <p v-if="loading && raws.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="raws.length === 0" class="text-[13px] text-ink-dim">
      no {{ status.toLowerCase() }} stakeholders. Run <span class="font-mono">pnpm bootstrap:stakeholders</span> from backend to populate.
    </p>

    <div v-else class="space-y-3">
      <div
        v-for="(raw, i) in raws"
        :key="raw.id"
        :class="['transition', loadingMutation && i === focusIdx ? 'opacity-50 pointer-events-none' : '']"
      >
        <RawStakeholderRow :raw="raw" :is-focused="i === focusIdx" @click="focusIdx = i" />
      </div>
    </div>

    <CreateStakeholderSlide
      :raw="focused"
      :loading="loadingMutation"
      :open="slideOpen"
      @submit="onCreateSubmit"
      @cancel="slideOpen = false"
    />
  </div>
</template>
