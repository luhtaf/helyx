<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useMe } from '@/composables/useAuth';
import { useTenantStats, severityCount, type MatchMode } from '@/composables/useDashboard';
import { useHealth } from '@/composables/useHealth';
import SectionRule from '@/components/ui/SectionRule.vue';
import SeverityBar from '@/components/ui/SeverityBar.vue';
import SeverityWord from '@/components/ui/SeverityWord.vue';

const auth = useAuthStore();
const { organizations } = useMe(() => auth.isAuthed);

const mode = ref<MatchMode>('EXACT');
const { stats, loading } = useTenantStats(() => mode.value, () => Boolean(auth.activeOrgId));
const { health } = useHealth();

const activeOrg = computed(() =>
  organizations.value.find((o) => o.id === auth.activeOrgId) ?? null,
);

const today = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

const syncedAt = computed(() => {
  const t = health.value?.serverTime;
  if (!t) return '—';
  return t.slice(11, 16);
});

const modes: MatchMode[] = ['EXACT', 'MAJOR_MINOR', 'MAJOR', 'BEAST'];
const modeLabel: Record<MatchMode, string> = {
  EXACT: 'exact',
  MAJOR_MINOR: 'maj.min',
  MAJOR: 'maj',
  BEAST: 'beast',
};

const counts = computed(() => ({
  critical: severityCount(stats.value?.cveCountsBySeverity, 'CRITICAL'),
  high:     severityCount(stats.value?.cveCountsBySeverity, 'HIGH'),
  medium:   severityCount(stats.value?.cveCountsBySeverity, 'MEDIUM'),
  low:      severityCount(stats.value?.cveCountsBySeverity, 'LOW'),
}));

const maxKindCount = computed(() =>
  Math.max(1, ...(stats.value?.assetsByKind ?? []).map((r) => r.count)),
);

function severityBorderColor(severity: string | null | undefined): string {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL': return 'var(--sev-crit)';
    case 'HIGH':     return 'var(--sev-high)';
    case 'MEDIUM':   return 'var(--sev-med)';
    case 'LOW':      return 'var(--sev-low)';
    default:         return 'var(--sev-none)';
  }
}

function severityRoute(sev: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') {
  return { path: '/cves', query: { severity: sev, mode: mode.value } };
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="flex items-baseline justify-between border-b border-rule-strong pb-4 mb-12">
      <div class="font-mono text-[11px] uppercase tracking-[0.16em]">
        <span class="text-ink font-medium">{{ activeOrg?.name ?? 'helyx' }}</span>
        <span class="mx-2 text-ink-faint">/</span>
        <span class="text-ink-dim">vuln report</span>
        <span class="mx-2 text-ink-faint">·</span>
        <span class="text-ink-dim">{{ today }}</span>
      </div>
      <div class="font-mono text-[11px] flex items-center gap-2">
        <template v-for="(m, i) in modes" :key="m">
          <span v-if="i > 0" class="text-ink-faint">/</span>
          <button
            type="button"
            :class="['transition', mode === m ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
            @click="mode = m"
          >{{ modeLabel[m] }}</button>
        </template>
      </div>
    </header>

    <section>
      <div class="grid grid-cols-4 gap-10 mb-6">
        <RouterLink :to="severityRoute('CRITICAL')" class="text-left group block">
          <p class="font-mono text-[44px] leading-none font-medium text-sev-crit tabular-nums">
            {{ loading && !stats ? '—' : counts.critical }}
          </p>
          <p class="mt-2 text-[13px] text-ink-dim group-hover:text-ink transition">critical</p>
        </RouterLink>
        <RouterLink :to="severityRoute('HIGH')" class="text-left group block">
          <p class="font-mono text-[44px] leading-none font-medium text-sev-high tabular-nums">
            {{ loading && !stats ? '—' : counts.high }}
          </p>
          <p class="mt-2 text-[13px] text-ink-dim group-hover:text-ink transition">high</p>
        </RouterLink>
        <RouterLink :to="severityRoute('MEDIUM')" class="text-left group block">
          <p class="font-mono text-[44px] leading-none font-medium text-sev-med tabular-nums">
            {{ loading && !stats ? '—' : counts.medium }}
          </p>
          <p class="mt-2 text-[13px] text-ink-dim group-hover:text-ink transition">medium</p>
        </RouterLink>
        <RouterLink :to="severityRoute('LOW')" class="text-left group block">
          <p class="font-mono text-[44px] leading-none font-medium text-sev-low tabular-nums">
            {{ loading && !stats ? '—' : counts.low }}
          </p>
          <p class="mt-2 text-[13px] text-ink-dim group-hover:text-ink transition">low</p>
        </RouterLink>
      </div>

      <SeverityBar
        :critical="counts.critical"
        :high="counts.high"
        :medium="counts.medium"
        :low="counts.low"
      />

      <p class="mt-3 font-mono text-[11px] text-ink-dim">
        <RouterLink :to="{ path: '/cves', query: { mode } }" class="text-ink hover:text-signal transition tabular-nums">
          {{ stats?.cveCount ?? '—' }}
        </RouterLink>
        vulnerabilities
        <span class="text-ink-faint mx-1.5">·</span>
        across
        <RouterLink to="/assets" class="text-ink hover:text-signal transition tabular-nums">
          {{ stats?.componentCount ?? '—' }}
        </RouterLink>
        components on
        <RouterLink to="/assets" class="text-ink hover:text-signal transition tabular-nums">
          {{ stats?.assetCount ?? '—' }}
        </RouterLink>
        assets
      </p>
    </section>

    <SectionRule label="what needs attention">
      <template #right>
        <RouterLink :to="{ path: '/cves', query: { mode } }" class="hover:text-ink transition">
          {{ Math.min(stats?.topCves?.length ?? 0, 8) }} of {{ stats?.cveCount ?? 0 }} →
        </RouterLink>
      </template>
    </SectionRule>

    <ul v-if="stats?.topCves?.length" class="space-y-0">
      <li
        v-for="cve in stats.topCves.slice(0, 8)"
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
            <span class="font-mono text-[10px] text-ink-faint shrink-0">
              {{ cve.affectedAssetCount }} {{ cve.affectedAssetCount === 1 ? 'asset' : 'assets' }}
              · published {{ cve.publishedAt?.slice(0, 10) ?? '—' }}
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-[13px] text-ink-dim">
      no matching vulnerabilities — ingest an SBOM to populate.
    </p>

    <SectionRule label="inventory">
      <template #right>
        {{ stats?.componentCount ?? 0 }} components on {{ stats?.assetCount ?? 0 }} assets
      </template>
    </SectionRule>

    <ul v-if="stats?.assetsByKind?.length">
      <li
        v-for="row in stats.assetsByKind"
        :key="row.kind"
        class="flex items-center gap-4 py-2"
      >
        <RouterLink
          :to="{ path: '/assets', query: { kind: row.kind } }"
          class="font-mono text-[11px] uppercase tracking-wider text-ink-dim hover:text-ink w-32 shrink-0 transition"
        >
          {{ row.kind.toLowerCase().replace('_', ' ') }}
        </RouterLink>
        <div class="grow flex items-center gap-3">
          <div class="h-1 bg-rule grow rounded-[1px] overflow-hidden">
            <div
              class="h-full bg-ink-dim"
              :style="{ width: (row.count / maxKindCount * 100) + '%' }"
            />
          </div>
          <span class="font-mono text-[11px] tabular-nums text-ink w-8 text-right">
            {{ row.count }}
          </span>
        </div>
      </li>
    </ul>
    <p v-else class="text-[13px] text-ink-dim">no assets yet.</p>

    <footer class="mt-16 pt-4 border-t border-rule font-mono text-[10px] text-ink-faint flex items-center gap-5">
      <span class="flex items-center gap-1.5">
        api
        <span :class="['inline-block h-1 w-1 rounded-full', health?.api ? 'bg-sev-low' : 'bg-sev-crit']" />
      </span>
      <span class="flex items-center gap-1.5">
        graph
        <span :class="['inline-block h-1 w-1 rounded-full', health?.db ? 'bg-sev-low' : 'bg-sev-crit']" />
      </span>
      <span class="ml-auto">synced {{ syncedAt }}</span>
    </footer>
  </div>
</template>
