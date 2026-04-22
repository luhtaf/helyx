<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTenantCves } from '@/composables/useCves';
import type { MatchMode } from '@/composables/useDashboard';
import SectionRule from '@/components/ui/SectionRule.vue';
import SeverityWord from '@/components/ui/SeverityWord.vue';
import Pagination from '@/components/ui/Pagination.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const MODES: MatchMode[] = ['EXACT', 'MAJOR_MINOR', 'MAJOR', 'BEAST'];
const MODE_LABEL: Record<MatchMode, string> = {
  EXACT: 'exact', MAJOR_MINOR: 'maj.min', MAJOR: 'maj', BEAST: 'beast',
};

const severity = computed(() => (route.query.severity as string) || null);
const search = ref((route.query.q as string) || '');
const mode = computed<MatchMode>(() => (route.query.mode as MatchMode) || 'EXACT');
const page = computed(() => Number(route.query.page) || 1);
const perPage = 25;

const { data, loading } = useTenantCves({
  page: () => page.value,
  perPage: () => perPage,
  severity: () => severity.value,
  search: () => search.value.trim() || null,
  mode: () => mode.value,
  enabled: () => Boolean(auth.activeOrgId),
});

function setQuery(patch: Record<string, string | null | undefined>): void {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (v != null && v !== '') next[k] = String(v);
  }
  router.replace({ path: '/cves', query: next });
}

function setSeverity(s: string | null): void {
  setQuery({ severity: s, page: '1' });
}

function setMode(m: MatchMode): void {
  setQuery({ mode: m, page: '1' });
}

function setPage(p: number): void {
  setQuery({ page: String(p) });
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery({ q: search.value.trim() || null, page: '1' }), 300);
});

function severityBorderColor(s: string | null | undefined): string {
  switch ((s ?? '').toUpperCase()) {
    case 'CRITICAL': return 'var(--sev-crit)';
    case 'HIGH':     return 'var(--sev-high)';
    case 'MEDIUM':   return 'var(--sev-med)';
    case 'LOW':      return 'var(--sev-low)';
    default:         return 'var(--sev-none)';
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">cves</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight">Vulnerability ledger</h1>
    </header>

    <div class="mb-8 grid gap-5">
      <div class="flex items-center gap-3 font-mono text-[11px]">
        <span class="text-ink-faint w-12">filter</span>
        <button
          type="button"
          :class="['transition', !severity ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
          @click="setSeverity(null)"
        >all</button>
        <span class="text-ink-faint">/</span>
        <template v-for="(s, i) in SEVERITIES" :key="s">
          <button
            type="button"
            :class="[
              'transition',
              severity === s ? `text-sev-${s.toLowerCase().replace('critical','crit').replace('medium','med')} font-medium` : 'text-ink-faint hover:text-ink-dim',
            ]"
            @click="setSeverity(s)"
          >{{ s.toLowerCase() }}</button>
          <span v-if="i < SEVERITIES.length - 1" class="text-ink-faint">/</span>
        </template>
      </div>

      <div class="flex items-center gap-3 font-mono text-[11px]">
        <span class="text-ink-faint w-12">mode</span>
        <template v-for="(m, i) in MODES" :key="m">
          <span v-if="i > 0" class="text-ink-faint">/</span>
          <button
            type="button"
            :class="['transition', mode === m ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
            @click="setMode(m)"
          >{{ MODE_LABEL[m] }}</button>
        </template>
      </div>

      <div class="flex items-center gap-3 font-mono text-[11px]">
        <span class="text-ink-faint w-12">search</span>
        <input
          v-model="search"
          type="search"
          placeholder="cve-id substring (e.g. 2024-0123)"
          class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-faint py-1 w-full max-w-xs transition"
        />
      </div>
    </div>

    <SectionRule label="results">
      <template #right>
        <span v-if="loading && !data">loading…</span>
        <span v-else-if="data">{{ data.total }} match{{ data.total === 1 ? '' : 'es' }}</span>
      </template>
    </SectionRule>

    <ul v-if="data?.items.length" class="space-y-0">
      <li
        v-for="cve in data.items"
        :key="cve.cveId"
        class="border-l-2 pl-4 py-3"
        :style="{ borderColor: severityBorderColor(cve.severity) }"
      >
        <RouterLink :to="`/cves/${cve.cveId}`" class="block group">
          <div class="flex items-baseline justify-between gap-4">
            <span class="font-mono text-[14px] text-ink group-hover:text-signal transition">
              {{ cve.cveId }}
            </span>
            <div class="flex items-baseline gap-3 shrink-0">
              <span v-if="cve.baseScore != null" class="font-mono text-[14px] text-ink tabular-nums">
                {{ cve.baseScore.toFixed(1) }}
              </span>
              <SeverityWord :severity="cve.severity" />
            </div>
          </div>
          <div class="mt-1.5 flex items-baseline justify-between gap-4">
            <p class="text-[12px] text-ink-dim line-clamp-1 grow">
              {{ cve.description ?? '—' }}
            </p>
            <span class="font-mono text-[10px] text-ink-faint shrink-0">
              {{ cve.affectedAssetCount }} {{ cve.affectedAssetCount === 1 ? 'asset' : 'assets' }}
              · {{ cve.publishedAt?.slice(0, 10) ?? '—' }}
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-[13px] text-ink-dim">
      no vulnerabilities match the current filter.
    </p>

    <div v-if="data" class="mt-8">
      <Pagination
        :page="data.page"
        :per-page="data.perPage"
        :total="data.total"
        @update:page="setPage"
      />
    </div>
  </div>
</template>
