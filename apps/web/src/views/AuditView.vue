<script setup lang="ts">
// /admin/audit — append-only audit log viewer. Filter by action /
// actor / target type / date range. Newest-first table with
// expandable before/after JSON per row.
//
// Min role ANALYST (operator can see peers' actions for accountability).
// Not a security secret — auditEvents is filtered by tenantId server-side.

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuditEvents, useAuditActions, type AuditEventFilter } from '@/composables/useAuditEvents';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Pagination from '@/components/ui/Pagination.vue';

const route = useRoute();
const router = useRouter();

// URL-driven filters so /admin/audit?action=rule.approve&actorUserId=...
// is shareable + reload-resilient.
const action = ref((route.query.action as string) || '');
const actorUserId = ref((route.query.actorUserId as string) || '');
const targetType = ref((route.query.targetType as string) || '');
const since = ref((route.query.since as string) || '');
const until = ref((route.query.until as string) || '');
const page = computed(() => Number(route.query.page) || 1);
const perPage = 50;

function setQuery(patch: Record<string, string | null | undefined>): void {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (v != null && v !== '') next[k] = String(v);
  }
  router.replace({ path: '/admin/audit', query: next });
}
watch(action, (v) => setQuery({ action: v || null, page: null }));
watch(actorUserId, (v) => setQuery({ actorUserId: v.trim() || null, page: null }));
watch(targetType, (v) => setQuery({ targetType: v.trim() || null, page: null }));
watch(since, (v) => setQuery({ since: v || null, page: null }));
watch(until, (v) => setQuery({ until: v || null, page: null }));

const filter = computed<AuditEventFilter>(() => ({
  action: action.value || null,
  actorUserId: actorUserId.value.trim() || null,
  targetType: targetType.value.trim() || null,
  // Date inputs are local YYYY-MM-DD; convert to UTC ISO bounds.
  since: since.value ? `${since.value}T00:00:00.000Z` : null,
  until: until.value ? `${until.value}T23:59:59.999Z` : null,
}));

const { data, loading } = useAuditEvents({
  filter: () => filter.value,
  page: () => page.value,
  perPage: () => perPage,
});
const { actions: knownActions } = useAuditActions();

const totalPages = computed(() => data.value ? Math.max(1, Math.ceil(data.value.total / perPage)) : 1);
function setPage(p: number): void {
  setQuery({ page: p === 1 ? null : String(p) });
}

// Expand state — keyed by event id. Click row → toggle before/after view.
const expanded = ref<Set<string>>(new Set());
function toggle(id: string): void {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}

function fmtTs(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19);
}

function prettyJson(s: string | null): string {
  if (!s) return '—';
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

// Actor display: prefer displayName → email → UUID prefix.
function actorLabel(a: { actorDisplayName: string | null; actorEmail: string | null; actorUserId: string }): string {
  return a.actorDisplayName || a.actorEmail || `user:${a.actorUserId.slice(0, 8)}`;
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1200px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', mono: false },
          { label: 'audit log' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">compliance · OWASP ASVS L2 V10</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight text-ink">Audit log</h1>
      <p class="mt-2 text-[12px] text-ink-faint max-w-[68ch]">
        Append-only record of every governance action: release-tier changes, approvals, archives, reconciliations, CTI exports. Filterable + shareable via URL.
      </p>
    </header>

    <!-- Filters -->
    <section class="mb-6 grid grid-cols-[180px_240px_160px_140px_140px] gap-3 font-mono text-[11px]">
      <label class="flex flex-col gap-1">
        <span class="text-ink-faint uppercase tracking-wider text-[10px]">action</span>
        <select v-model="action" class="h-9 rounded-md bg-surface border border-rule px-2 text-ink focus:outline-none focus:border-ink-dim">
          <option value="">all actions</option>
          <option v-for="a in knownActions" :key="a" :value="a">{{ a }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-ink-faint uppercase tracking-wider text-[10px]">actor (user id)</span>
        <input v-model="actorUserId" type="text" placeholder="paste UUID" class="h-9 rounded-md bg-surface border border-rule px-2 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink-dim" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-ink-faint uppercase tracking-wider text-[10px]">target type</span>
        <input v-model="targetType" type="text" placeholder="rule | hunt | case…" class="h-9 rounded-md bg-surface border border-rule px-2 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink-dim" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-ink-faint uppercase tracking-wider text-[10px]">since</span>
        <input v-model="since" type="date" class="h-9 rounded-md bg-surface border border-rule px-2 text-ink focus:outline-none focus:border-ink-dim" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-ink-faint uppercase tracking-wider text-[10px]">until</span>
        <input v-model="until" type="date" class="h-9 rounded-md bg-surface border border-rule px-2 text-ink focus:outline-none focus:border-ink-dim" />
      </label>
    </section>

    <p v-if="loading && !data" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="data && data.total === 0" class="text-[13px] text-ink-dim">no audit events match the filter.</p>

    <section v-else-if="data" class="border border-rule-strong rounded-md overflow-hidden">
      <header class="grid grid-cols-[150px_180px_180px_1fr_30px] gap-3 px-4 py-2 border-b border-rule font-mono text-[10px] uppercase tracking-wider text-ink-faint bg-surface/30">
        <span>timestamp</span>
        <span>actor</span>
        <span>action</span>
        <span>target</span>
        <span></span>
      </header>
      <template v-for="e in data.items" :key="e.id">
        <button
          type="button"
          class="w-full grid grid-cols-[150px_180px_180px_1fr_30px] gap-3 items-center px-4 py-2.5 border-b border-rule hover:bg-surface/30 transition text-left"
          @click="toggle(e.id)"
        >
          <span class="font-mono text-[11px] text-ink-dim tabular-nums">{{ fmtTs(e.ts) }}</span>
          <span class="truncate text-[12px] text-ink" :title="e.actorEmail || e.actorUserId">{{ actorLabel(e) }}</span>
          <span class="font-mono text-[11px] text-signal truncate">{{ e.action }}</span>
          <span class="font-mono text-[11px] text-ink-dim truncate" :title="`${e.targetType}:${e.targetId}`">
            <span class="text-ink-faint">{{ e.targetType }}</span>:<span>{{ e.targetId.slice(0, 12) }}…</span>
          </span>
          <span class="font-mono text-[10px] text-ink-faint">{{ expanded.has(e.id) ? '▾' : '▸' }}</span>
        </button>
        <div v-if="expanded.has(e.id)" class="px-4 py-3 border-b border-rule bg-base/60">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="font-mono text-[9px] uppercase tracking-wider text-ink-faint mb-1">before</p>
              <pre class="font-mono text-[10px] text-ink-dim bg-surface/40 border border-rule rounded-sm p-2 overflow-x-auto max-h-[200px]">{{ prettyJson(e.before) }}</pre>
            </div>
            <div>
              <p class="font-mono text-[9px] uppercase tracking-wider text-ink-faint mb-1">after</p>
              <pre class="font-mono text-[10px] text-ink-dim bg-surface/40 border border-rule rounded-sm p-2 overflow-x-auto max-h-[200px]">{{ prettyJson(e.after) }}</pre>
            </div>
          </div>
          <div class="mt-2 font-mono text-[10px] text-ink-faint">
            event id: {{ e.id }} · actor user: {{ e.actorUserId }} · target: {{ e.targetType }}:{{ e.targetId }}
          </div>
        </div>
      </template>
    </section>

    <Pagination
      v-if="data && data.total > perPage"
      :page="data.page"
      :per-page="perPage"
      :total="data.total"
      class="mt-6"
      @update:page="setPage"
    />
  </div>
</template>
