<!-- /autoplan restore point: /Users/fathulikhsan/.gstack/projects/luhtaf-helyx/main-autoplan-restore-20260508-105657.md -->
# Helyx Admin UI Phase 1 — Stakeholder + Reconciliation + Case Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **AI-AGNOSTIC RESUME:** Plan is consumable by any AI agent (Claude, Kimi, GPT, Gemini). Required state: this file + `/Users/fathulikhsan/Project/Vuln/CLAUDE.md` + `git log -25` + `docs/master-data-spec.md` + `docs/ca-case-spec.md`. Each task self-contained — full code inline.

**Goal:** Ship the minimum admin UI surface so Helyx operators can populate the master-data + CA case backend that Phase 2/3 just shipped. 5 new routes, keyboard-first reconciliation inbox, stakeholder graph hub, case list + create wizard. Defers per-type artifact forms to v2.

**Architecture:** Vue 3 Composition API + Apollo Client. Composables-first (data + state in `src/composables/`, components only render). Forensic-ledger design system per CLAUDE.md (warm dark, JBM primary for IDs/numbers, Inter Tight prose, severity pigments). Detail pages = graph hubs per CLAUDE.md OpenCTI convention.

**Tech Stack:** Vue 3, Vite, TypeScript, Tailwind, Apollo Client, vue-router 4, @vue/apollo-composable, graphql-tag.

**Spec source:**
- `docs/master-data-spec.md` (Stakeholder + reconciliation UI flow)
- `docs/ca-case-spec.md` (Case + 11 artifact types — only Case scope this iteration)

**Project conventions (non-negotiable per CLAUDE.md):**
- `<script setup lang="ts">` everywhere
- Composables-first: data fetching + state in `src/composables/`, components render only
- File ceiling 500-1000 lines; aim well below 250
- Forensic-ledger CSS vars: `--bg`, `--surface`, `--ink`, `--ink-mid`, `--ink-dim`, `--ink-faint`, `--rule`, `--rule-strong`, `--signal`, `--sev-*`
- JBM (font-mono) for IDs/numbers/section-labels; Inter Tight (default) for prose
- Detail pages = graph hubs (clickable relations everywhere, no terminal pages)
- Reconciliation inbox MUST be keyboard-first (spec explicit)
- No tests yet — verification = `pnpm --filter @helyx/web exec vue-tsc --noEmit` + browser manual

---

## Resume / Handover Guidance

Fresh AI session resume protocol:

1. **Read this plan top-to-bottom**
2. **Read `/Users/fathulikhsan/Project/Vuln/CLAUDE.md`** (project rules + design system + cache+auth+audit sections)
3. **Read `docs/master-data-spec.md` + `docs/ca-case-spec.md`** for UX flows
4. `git log --oneline -20` to find current progress
5. Find first unchecked `- [ ]` checkbox, execute that task
6. Each task self-contained — full code inline, no "it knows" assumptions
7. Backend dev server runs on :4000. Web dev on :5173. If not running: `pnpm dev` from repo root.
8. **Login flow for browser-verify:** register → login → cookies set automatically. Existing dev user: `verify2@helyx.test` / `VerifyPass123!`. Or register fresh in /login.

---

## File Structure

**Routes + nav (modify existing):**
- `apps/web/src/router/index.ts` — add 5 new routes
- `apps/web/src/components/layout/Sidebar.vue` — add Stakeholders + Inbox + CA nav items

**Composables (5 new):**
- `apps/web/src/composables/useStakeholders.ts` — list + filter + create + sektor list
- `apps/web/src/composables/useStakeholder.ts` — detail (sektor + sensor + cases via auto-resolved nested)
- `apps/web/src/composables/useReconciliationInbox.ts` — pending + counts + resolve mutations
- `apps/web/src/composables/useCases.ts` — list + filter + create
- `apps/web/src/composables/useCase.ts` — detail + artifactsByType counts

**Components (small UI bits, 4 new):**
- `apps/web/src/components/stakeholder/SensorStatusPill.vue` (online/degraded/offline color)
- `apps/web/src/components/stakeholder/SektorBadge.vue` (slug → display name + click → filter)
- `apps/web/src/components/case/CaseStatusBadge.vue` (DRAFT/ACTIVE/CLOSED/ARCHIVED)
- `apps/web/src/components/case/CaseVerdictBadge.vue` (CONFIRMED/INCONCLUSIVE/CLEAN/PENDING)

**Reconciliation components (3 new):**
- `apps/web/src/components/reconciliation/RawStakeholderRow.vue` — single row layout per spec
- `apps/web/src/components/reconciliation/CreateStakeholderSlide.vue` — slide-in form for "N" action
- `apps/web/src/components/reconciliation/SuggestionList.vue` — top-3 fuzzy w/ confidence + reason

**Views (5 new):**
- `apps/web/src/views/StakeholdersView.vue` — list + filter + search
- `apps/web/src/views/StakeholderDetailView.vue` — graph hub
- `apps/web/src/views/ReconciliationInboxView.vue` — keyboard-first inbox
- `apps/web/src/views/CasesView.vue` — list + filter
- `apps/web/src/views/CaseCreateView.vue` — 3-step wizard
- `apps/web/src/views/CaseDetailView.vue` — header + 3 tabs (counts only, no artifact forms)

**Total new files:** 17 · **Modified files:** 2 · **Estimated total LOC:** ~2200 spread across 17 files (avg ~130 each, max ~250)

---

## Out of Scope (defer to UI v2)

- 11 per-type Artifact create forms (slide-in panels per type)
- Bulk paste IOC UI (backend-ready, UI defers)
- Wazuh alert paste UI
- Findings + Timeline tab CONTENT (placeholder header/empty state only)
- Edit case mid-stream / close case verdict UI (read-only this iter)
- Stakeholder edit UI (create from raw is the only UI path; edit via direct GraphQL for now)
- Bulk pattern selector for reconciliation (`B` key shows toast "coming soon")
- Merge mode (`M` key shows toast)
- Recently-used host autocomplete
- Templates feature

---

## Task 0.5: Auth store role state + router role guard (gating CRITICAL)

**Why FIRST:** /admin/stakeholders/inbox needs ADMIN-only. Current router only checks `auth.isAuthed`; auth store has no role state. Without this, VIEWERs can navigate to admin route → backend rejects but UI silent-loads. Caught by /autoplan CEO #1 + Eng #31 (cross-phase Theme 1).

**Files:**
- Modify: `apps/web/src/stores/auth.ts` — add `activeOrgRole` field
- Modify: `apps/web/src/composables/useAuth.ts` — populate role from `me` query (`organizations { myRole }`)
- Modify: `apps/web/src/router/index.ts` — extend `beforeEach` for `requiresRole` meta

- [ ] **Step 1: Add role to auth store**

In `stores/auth.ts`, add `activeOrgRole` ref + persist it. Define type:

```typescript
export type OrgRole = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';

const activeOrgRole = ref<OrgRole | null>(null);

function setActiveOrg(orgId: string, role: OrgRole | null = null): void {
  activeOrgId.value = orgId;
  activeOrgRole.value = role;
  persist();
}
// Modify persist() to include activeOrgRole
// Modify hydrate to read activeOrgRole
// Export activeOrgRole + setActiveOrg
```

- [ ] **Step 2: Populate role from useMe**

In `composables/useAuth.ts` `useMe` query, ensure `me { organizations { id name myRole } }` is selected. When the active org is chosen (or first one auto-picked), call `auth.setActiveOrg(orgId, myRole)`.

If existing code calls `setActiveOrg(orgId)` without role, change all call sites to pass role.

- [ ] **Step 3: Router guard**

In `router/index.ts` `beforeEach`:

```typescript
const ROLE_RANK: Record<string, number> = { OWNER: 4, ADMIN: 3, ANALYST: 2, VIEWER: 1 };

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (auth.isAuthed && to.name === 'login') return { name: 'dashboard' };
    return true;
  }
  if (!auth.isAuthed) return { name: 'login', query: { next: to.fullPath } };
  const required = to.meta.requiresRole as string | undefined;
  if (required) {
    const have = auth.activeOrgRole;
    if (!have || (ROLE_RANK[have] ?? 0) < (ROLE_RANK[required] ?? 99)) {
      return { name: 'dashboard', query: { reason: 'forbidden' } };
    }
  }
  return true;
});
```

- [ ] **Step 4: DashboardView banner for forbidden redirect**

Add to dashboard view (or root):
```vue
<div v-if="$route.query.reason === 'forbidden'" class="border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit rounded-md mb-4">
  Anda tidak punya izin untuk halaman tersebut.
</div>
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/stores/auth.ts apps/web/src/composables/useAuth.ts apps/web/src/router/index.ts apps/web/src/views/DashboardView.vue
git commit -m "feat(web): auth store activeOrgRole + router requiresRole guard"
```

---

## Task 1: Routes + Sidebar nav additions

**Files:**
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/components/layout/Sidebar.vue`

- [ ] **Step 1: Add 5 routes**

In `apps/web/src/router/index.ts`, find the routes array. Add these 5 entries (place near existing `/hunts` and `/threat-actors` patterns):

```typescript
{
  path: '/stakeholders',
  name: 'stakeholders',
  component: () => import('@/views/StakeholdersView.vue'),
  meta: { title: 'Stakeholders' },
},
{
  path: '/stakeholders/:id',
  name: 'stakeholder-detail',
  component: () => import('@/views/StakeholderDetailView.vue'),
  props: true,
  meta: { title: 'Stakeholder' },
},
{
  path: '/admin/stakeholders/inbox',
  name: 'reconciliation-inbox',
  component: () => import('@/views/ReconciliationInboxView.vue'),
  meta: { title: 'Reconciliation Inbox', requiresRole: 'ADMIN' },
},
{
  path: '/cases',
  name: 'cases',
  component: () => import('@/views/CasesView.vue'),
  meta: { title: 'Cases' },
},
{
  path: '/cases/new',
  name: 'case-new',
  component: () => import('@/views/CaseCreateView.vue'),
  meta: { title: 'New Case' },
},
{
  path: '/cases/:id',
  name: 'case-detail',
  component: () => import('@/views/CaseDetailView.vue'),
  props: true,
  meta: { title: 'Case' },
},
```

- [ ] **Step 2: Add Sidebar nav items**

Read `apps/web/src/components/layout/Sidebar.vue` first to understand current structure (likely an array of nav items with `to`, `label`, optional `group` or section header).

Pattern: integrate into existing groups OR add new sections. Two new entries needed:
- "Stakeholders" — same group as Inventory (Assets, Hunt). Link to `/stakeholders`.
- "Cases" — new section "Compromise Assessment". Link to `/cases`.
- "Reconciliation Inbox" — admin section (if no admin section exists, create one). Link to `/admin/stakeholders/inbox`.

If Sidebar uses a flat array, just append. If grouped, follow existing group convention.

- [ ] **Step 3: Stub view files (so route imports resolve)**

Create empty placeholder views so vue-tsc + dev server don't fail. Each is a 1-line stub:

`apps/web/src/views/StakeholdersView.vue`:
```vue
<template><div class="px-12 py-10">Stakeholders (Task 5)</div></template>
```

Same shape for: StakeholderDetailView.vue, ReconciliationInboxView.vue, CasesView.vue, CaseCreateView.vue, CaseDetailView.vue.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
```
Expected: clean.

```bash
# In browser, visit each:
# http://localhost:5173/stakeholders → "Stakeholders (Task 5)"
# http://localhost:5173/admin/stakeholders/inbox → "Reconciliation Inbox (Task ...)"
# etc.
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/router/index.ts apps/web/src/components/layout/Sidebar.vue apps/web/src/views/StakeholdersView.vue apps/web/src/views/StakeholderDetailView.vue apps/web/src/views/ReconciliationInboxView.vue apps/web/src/views/CasesView.vue apps/web/src/views/CaseCreateView.vue apps/web/src/views/CaseDetailView.vue
git commit -m "feat(web): add 5 admin routes + sidebar nav (stakeholder/inbox/cases)"
```

---

## Task 2: useStakeholders + useStakeholder composables

**Files:**
- Create: `apps/web/src/composables/useStakeholders.ts`
- Create: `apps/web/src/composables/useStakeholder.ts`

- [ ] **Step 1: useStakeholders.ts**

```typescript
// apps/web/src/composables/useStakeholders.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export interface Sektor {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  stakeholderCount: number;
}

export interface SensorSummary {
  stack: 'WAZUH_FULL' | 'ELK_FULL' | 'WAZUH_AGENT' | 'MIXED' | null;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | null;
  agentCount: number | null;
  deployedAt: string | null;
  notes: string | null;
}

export interface Stakeholder {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  city: string | null;
  coords: [number, number] | null;
  notes: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  sektor: Sektor | null;
  sensor: SensorSummary;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholdersFilter {
  sektorId?: string | null;
  status?: 'ACTIVE' | 'ARCHIVED' | null;
  search?: string | null;
}

const SEKTORS = gql`
  query Sektors {
    sektors { id slug name displayOrder stakeholderCount }
  }
`;

const STAKEHOLDERS = gql`
  query Stakeholders($sektorId: ID, $status: StakeholderStatus, $search: String, $first: Int = 100) {
    stakeholders(sektorId: $sektorId, status: $status, search: $search, first: $first) {
      id slug name aliases city coords status
      sektor { id slug name }
      sensor { stack status agentCount deployedAt }
    }
  }
`;

const CREATE_STAKEHOLDER = gql`
  mutation CreateStakeholder($input: StakeholderInput!) {
    createStakeholder(input: $input) {
      id slug name aliases city coords status
      sektor { id slug name }
      sensor { stack status }
    }
  }
`;

export function useSektors(): {
  sektors: ComputedRef<Sektor[]>;
  loading: Ref<boolean>;
} {
  const { result, loading } = useQuery<{ sektors: Sektor[] }>(SEKTORS, undefined, {
    fetchPolicy: 'cache-first',
  });
  return {
    sektors: computed(() => result.value?.sektors ?? []),
    loading,
  };
}

export function useStakeholders(filter: () => StakeholdersFilter): {
  stakeholders: ComputedRef<Stakeholder[]>;
  loading: Ref<boolean>;
  refetch: () => void;
} {
  const { result, loading, refetch } = useQuery<{ stakeholders: Stakeholder[] }>(
    STAKEHOLDERS,
    () => ({
      sektorId: filter().sektorId ?? null,
      status: filter().status ?? null,
      search: filter().search ?? null,
      first: 100,
    }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  return {
    stakeholders: computed(() => result.value?.stakeholders ?? []),
    loading,
    refetch: () => { refetch(); },
  };
}

export interface StakeholderInput {
  slug: string;
  name: string;
  aliases?: string[];
  city?: string;
  coords?: [number, number];
  notes?: string;
  sektorId?: string;
}

export function useCreateStakeholder() {
  const { mutate, loading, error } = useMutation<{ createStakeholder: Stakeholder }, { input: StakeholderInput }>(CREATE_STAKEHOLDER);
  async function submit(input: StakeholderInput): Promise<Stakeholder | null> {
    const r = await mutate({ input });
    return r?.data?.createStakeholder ?? null;
  }
  return { submit, loading, error };
}
```

- [ ] **Step 2: useStakeholder.ts (single + nested)**

```typescript
// apps/web/src/composables/useStakeholder.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';

const STAKEHOLDER = gql`
  query Stakeholder($id: ID!) {
    stakeholder(id: $id) {
      id slug name aliases city coords notes status
      createdAt updatedAt
      sektor { id slug name displayOrder stakeholderCount }
      sensor { stack status agentCount deployedAt notes }
    }
  }
`;

export function useStakeholder(id: () => string): {
  stakeholder: ComputedRef<Stakeholder | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ stakeholder: Stakeholder | null }>(
    STAKEHOLDER,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    stakeholder: computed(() => result.value?.stakeholder ?? null),
    loading,
    error,
  };
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/composables/useStakeholders.ts apps/web/src/composables/useStakeholder.ts
git commit -m "feat(web): useStakeholders + useStakeholder composables (list/detail/create/sektors)"
```

---

## Task 3: useReconciliationInbox composable

**Files:**
- Create: `apps/web/src/composables/useReconciliationInbox.ts`

- [ ] **Step 1: Write composable with queries + 5 mutations**

```typescript
// apps/web/src/composables/useReconciliationInbox.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';

export type ReconciliationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface StakeholderSuggestion {
  stakeholder: Stakeholder;
  confidence: number;
  reason: string;
}

export interface RawStakeholder {
  id: string;
  source: string;
  rawName: string;
  rawSektor: string | null;
  hitCount: number;
  targetCount: number;
  lastSeen: string;
  status: ReconciliationStatus;
  confidence: number | null;
  resolvedTo: Stakeholder | null;
  resolvedAt: string | null;
  suggestions: StakeholderSuggestion[];
}

export interface RawStakeholderCounts {
  pending: number;
  approved: number;
  rejected: number;
  needsReview: number;
}

const RAW_STAKEHOLDERS = gql`
  query RawStakeholders($status: ReconciliationStatus = PENDING, $first: Int = 50) {
    rawStakeholders(status: $status, first: $first) {
      id source rawName rawSektor hitCount targetCount lastSeen status confidence
      resolvedTo { id slug name }
      resolvedAt
      suggestions {
        confidence reason
        stakeholder { id slug name aliases sektor { slug name } }
      }
    }
  }
`;

const RAW_COUNTS = gql`
  query RawStakeholderCounts {
    rawStakeholderCounts { pending approved rejected needsReview }
  }
`;

const RESOLVE_RAW = gql`
  mutation ResolveRaw($rawId: ID!, $stakeholderId: ID!) {
    resolveRawStakeholder(rawId: $rawId, stakeholderId: $stakeholderId) {
      id status resolvedTo { slug name }
    }
  }
`;

const REJECT_RAW = gql`
  mutation RejectRaw($rawId: ID!, $reason: String) {
    rejectRawStakeholder(rawId: $rawId, reason: $reason) { id status }
  }
`;

const CREATE_FROM_RAW = gql`
  mutation CreateFromRaw($rawId: ID!, $input: StakeholderInput!) {
    createStakeholderFromRaw(rawId: $rawId, input: $input) {
      id status resolvedTo { id slug name }
    }
  }
`;

const RECOMPUTE = gql`
  mutation Recompute($rawId: ID) {
    recomputeSuggestions(rawId: $rawId)
  }
`;

const BULK_RESOLVE = gql`
  mutation BulkResolve($rawIds: [ID!]!, $stakeholderId: ID!) {
    bulkResolveRawStakeholders(rawIds: $rawIds, stakeholderId: $stakeholderId)
  }
`;

export function useReconciliationInbox(status: () => ReconciliationStatus): {
  raws: ComputedRef<RawStakeholder[]>;
  counts: ComputedRef<RawStakeholderCounts>;
  loading: Ref<boolean>;
  refetch: () => void;
  resolve: (rawId: string, stakeholderId: string) => Promise<RawStakeholder | null>;
  reject: (rawId: string, reason?: string) => Promise<RawStakeholder | null>;
  createFromRaw: (rawId: string, input: import('./useStakeholders').StakeholderInput) => Promise<RawStakeholder | null>;
  recompute: (rawId?: string) => Promise<number>;
  bulkResolve: (rawIds: string[], stakeholderId: string) => Promise<number>;
} {
  const listQ = useQuery<{ rawStakeholders: RawStakeholder[] }>(
    RAW_STAKEHOLDERS,
    () => ({ status: status(), first: 50 }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  const countsQ = useQuery<{ rawStakeholderCounts: RawStakeholderCounts }>(
    RAW_COUNTS, undefined, { fetchPolicy: 'cache-and-network' },
  );

  const resolveM = useMutation(RESOLVE_RAW);
  const rejectM = useMutation(REJECT_RAW);
  const createM = useMutation(CREATE_FROM_RAW);
  const recomputeM = useMutation(RECOMPUTE);
  const bulkM = useMutation(BULK_RESOLVE);

  function refetchAll(): void {
    listQ.refetch();
    countsQ.refetch();
  }

  return {
    raws: computed(() => listQ.result.value?.rawStakeholders ?? []),
    counts: computed(() => listQ.result.value && countsQ.result.value
      ? countsQ.result.value.rawStakeholderCounts
      : { pending: 0, approved: 0, rejected: 0, needsReview: 0 }),
    loading: listQ.loading,
    refetch: refetchAll,
    resolve: async (rawId, stakeholderId) => {
      const r = await resolveM.mutate({ rawId, stakeholderId });
      refetchAll();
      return (r?.data as { resolveRawStakeholder: RawStakeholder } | undefined)?.resolveRawStakeholder ?? null;
    },
    reject: async (rawId, reason) => {
      const r = await rejectM.mutate({ rawId, reason: reason ?? null });
      refetchAll();
      return (r?.data as { rejectRawStakeholder: RawStakeholder } | undefined)?.rejectRawStakeholder ?? null;
    },
    createFromRaw: async (rawId, input) => {
      const r = await createM.mutate({ rawId, input });
      refetchAll();
      return (r?.data as { createStakeholderFromRaw: RawStakeholder } | undefined)?.createStakeholderFromRaw ?? null;
    },
    recompute: async (rawId) => {
      const r = await recomputeM.mutate({ rawId: rawId ?? null });
      refetchAll();
      return ((r?.data as { recomputeSuggestions: number } | undefined)?.recomputeSuggestions) ?? 0;
    },
    bulkResolve: async (rawIds, stakeholderId) => {
      const r = await bulkM.mutate({ rawIds, stakeholderId });
      refetchAll();
      return ((r?.data as { bulkResolveRawStakeholders: number } | undefined)?.bulkResolveRawStakeholders) ?? 0;
    },
  };
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/composables/useReconciliationInbox.ts
git commit -m "feat(web): useReconciliationInbox composable (list+counts+5 mutations)"
```

---

## Task 4: useCases + useCase composables

**Files:**
- Create: `apps/web/src/composables/useCases.ts`
- Create: `apps/web/src/composables/useCase.ts`

- [ ] **Step 1: useCases.ts**

```typescript
// apps/web/src/composables/useCases.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';

export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type CaseVerdict = 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN' | 'PENDING';

export interface CaseSummary {
  id: string;
  reportNo: string;
  title: string | null;
  trigger: string | null;
  summary: string | null;
  status: CaseStatus;
  verdict: CaseVerdict | null;
  deployedAt: string;
  closedAt: string | null;
  artifactCount: number;
  stakeholder: Pick<Stakeholder, 'id' | 'slug' | 'name' | 'city'>;
}

export interface CaseInput {
  reportNo: string;
  title?: string;
  trigger?: string;
  summary?: string;
  stakeholderId: string;
  leadUserId?: string;
  deployedAt: string;
  status?: CaseStatus;
}

export interface CasesFilter {
  stakeholderId?: string | null;
  status?: CaseStatus[] | null;
  search?: string | null;
}

const CASES = gql`
  query Cases($stakeholderId: ID, $status: [CaseStatus!], $search: String, $first: Int = 100) {
    cases(stakeholderId: $stakeholderId, status: $status, search: $search, first: $first) {
      id reportNo title status verdict deployedAt closedAt artifactCount
      stakeholder { id slug name city }
    }
  }
`;

const CREATE_CASE = gql`
  mutation CreateCase($input: CaseInput!) {
    createCase(input: $input) {
      id reportNo title status verdict deployedAt artifactCount
      stakeholder { id slug name city }
    }
  }
`;

export function useCases(filter: () => CasesFilter): {
  cases: ComputedRef<CaseSummary[]>;
  loading: Ref<boolean>;
  refetch: () => void;
} {
  const { result, loading, refetch } = useQuery<{ cases: CaseSummary[] }>(
    CASES,
    () => ({
      stakeholderId: filter().stakeholderId ?? null,
      status: filter().status && filter().status!.length > 0 ? filter().status : null,
      search: filter().search ?? null,
      first: 100,
    }),
    () => ({ fetchPolicy: 'cache-and-network' }),
  );
  return {
    cases: computed(() => result.value?.cases ?? []),
    loading,
    refetch: () => { refetch(); },
  };
}

export function useCreateCase() {
  const { mutate, loading, error } = useMutation<{ createCase: CaseSummary }, { input: CaseInput }>(CREATE_CASE);
  async function submit(input: CaseInput): Promise<CaseSummary | null> {
    const r = await mutate({ input });
    return r?.data?.createCase ?? null;
  }
  return { submit, loading, error };
}
```

- [ ] **Step 2: useCase.ts (single + artifactsByType counts)**

```typescript
// apps/web/src/composables/useCase.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { CaseSummary } from './useCases';

export interface ArtifactCounts {
  ioc: number;
  file: number;
  process: number;
  network: number;
  registry: number;
  persistence: number;
  account: number;
  logFinding: number;
  memory: number;
  detectionHit: number;
  note: number;
}

export interface CaseDetail extends CaseSummary {
  trigger: string | null;
  summary: string | null;
  artifactsByType: ArtifactCounts;
}

const CASE = gql`
  query Case($id: ID!) {
    case(id: $id) {
      id reportNo title trigger summary status verdict deployedAt closedAt artifactCount
      stakeholder { id slug name city }
      artifactsByType {
        ioc file process network registry persistence account
        logFinding memory detectionHit note
      }
    }
  }
`;

export function useCase(id: () => string): {
  case: ComputedRef<CaseDetail | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ case: CaseDetail | null }>(
    CASE,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    case: computed(() => result.value?.case ?? null),
    loading,
    error,
  };
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/composables/useCases.ts apps/web/src/composables/useCase.ts
git commit -m "feat(web): useCases + useCase composables (list/detail/create)"
```

---

## Task 5: Small UI components (4 badges/pills)

**Files:**
- Create: `apps/web/src/components/stakeholder/SensorStatusPill.vue`
- Create: `apps/web/src/components/stakeholder/SektorBadge.vue`
- Create: `apps/web/src/components/case/CaseStatusBadge.vue`
- Create: `apps/web/src/components/case/CaseVerdictBadge.vue`

- [ ] **Step 1: SensorStatusPill.vue**

```vue
<script setup lang="ts">
defineProps<{ status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | null }>();

const colorMap: Record<string, string> = {
  ONLINE: 'bg-sev-low/15 text-sev-low border-sev-low/30',
  DEGRADED: 'bg-sev-med/15 text-sev-med border-sev-med/30',
  OFFLINE: 'bg-sev-crit/15 text-sev-crit border-sev-crit/30',
};

const labelMap: Record<string, string> = {
  ONLINE: 'online',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
};
</script>

<template>
  <span
    v-if="status"
    :class="['inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', colorMap[status]]"
  >
    <span class="inline-block w-1 h-1 rounded-full bg-current" />
    {{ labelMap[status] }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">no sensor</span>
</template>
```

- [ ] **Step 2: SektorBadge.vue**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';

defineProps<{ sektor: { slug: string; name: string } | null; clickable?: boolean }>();

const router = useRouter();

function navigate(slug: string): void {
  router.push({ path: '/stakeholders', query: { sektor: slug } });
}
</script>

<template>
  <button
    v-if="sektor && clickable"
    type="button"
    class="inline-flex items-center px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim hover:text-ink hover:border-ink-faint transition font-mono text-[10px] uppercase tracking-wider"
    @click="navigate(sektor.slug)"
  >
    {{ sektor.name }}
  </button>
  <span
    v-else-if="sektor"
    class="inline-flex items-center px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim font-mono text-[10px] uppercase tracking-wider"
  >
    {{ sektor.name }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">unsektored</span>
</template>
```

- [ ] **Step 3: CaseStatusBadge.vue**

```vue
<script setup lang="ts">
import type { CaseStatus } from '@/composables/useCases';
defineProps<{ status: CaseStatus }>();

const colorMap: Record<CaseStatus, string> = {
  DRAFT: 'bg-ink-faint/15 text-ink-dim border-ink-faint/30',
  ACTIVE: 'bg-sev-high/15 text-sev-high border-sev-high/30',
  CLOSED: 'bg-sev-low/15 text-sev-low border-sev-low/30',
  ARCHIVED: 'bg-ink-faint/10 text-ink-faint border-ink-faint/20',
};
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', colorMap[status]]">
    {{ status.toLowerCase() }}
  </span>
</template>
```

- [ ] **Step 4: CaseVerdictBadge.vue**

```vue
<script setup lang="ts">
import type { CaseVerdict } from '@/composables/useCases';
defineProps<{ verdict: CaseVerdict | null }>();

const colorMap: Record<CaseVerdict, string> = {
  CONFIRMED: 'bg-sev-crit/15 text-sev-crit border-sev-crit/30',
  INCONCLUSIVE: 'bg-sev-med/15 text-sev-med border-sev-med/30',
  CLEAN: 'bg-sev-low/15 text-sev-low border-sev-low/30',
  PENDING: 'bg-ink-faint/15 text-ink-dim border-ink-faint/30',
};

const labelMap: Record<CaseVerdict, string> = {
  CONFIRMED: 'compromised',
  INCONCLUSIVE: 'inconclusive',
  CLEAN: 'clean',
  PENDING: 'pending',
};
</script>

<template>
  <span
    v-if="verdict"
    :class="['inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', colorMap[verdict]]"
  >
    {{ labelMap[verdict] }}
  </span>
  <span v-else class="font-mono text-[10px] text-ink-faint uppercase tracking-wider">—</span>
</template>
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/components/stakeholder/ apps/web/src/components/case/
git commit -m "feat(web): SensorStatusPill + SektorBadge + Case status/verdict badges"
```

---

## Task 6: StakeholdersView (list + filter)

**Files:**
- Modify: `apps/web/src/views/StakeholdersView.vue` (replace stub)

- [ ] **Step 1: Full view**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStakeholders, useSektors, type StakeholdersFilter } from '@/composables/useStakeholders';
import SensorStatusPill from '@/components/stakeholder/SensorStatusPill.vue';
import SektorBadge from '@/components/stakeholder/SektorBadge.vue';

const route = useRoute();
const router = useRouter();

const search = ref<string>((route.query.q as string) ?? '');
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

const { stakeholders, loading } = useStakeholders(() => filter.value);

function go(s: { id: string }): void {
  router.push({ name: 'stakeholder-detail', params: { id: s.id } });
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
        <p class="font-mono text-[11px] text-ink-dim tabular-nums">
          {{ loading ? '…' : stakeholders.length }} entities
        </p>
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-4 mb-6">
      <input
        v-model="search"
        type="search"
        placeholder="name or alias substring"
        class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-dim py-1 w-full max-w-xs transition"
      />
      <select v-model="sektorSlugFilter" class="bg-surface border border-rule-strong rounded-md px-3 py-1.5 text-sm text-ink">
        <option value="">All sektors</option>
        <option v-for="s in sektors" :key="s.id" :value="s.slug">{{ s.name }} ({{ s.stakeholderCount }})</option>
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

    <table class="w-full text-sm">
      <thead>
        <tr class="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule-strong">
          <th class="py-2">slug</th>
          <th class="py-2">name</th>
          <th class="py-2">sektor</th>
          <th class="py-2">city</th>
          <th class="py-2">sensor</th>
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
          <td class="py-3 font-mono text-[12px] text-ink-dim">{{ s.slug }}</td>
          <td class="py-3 text-ink">{{ s.name }}</td>
          <td class="py-3"><SektorBadge :sektor="s.sektor" /></td>
          <td class="py-3 text-ink-dim text-[13px]">{{ s.city ?? '—' }}</td>
          <td class="py-3"><SensorStatusPill :status="s.sensor.status" /></td>
          <td class="py-3 text-right font-mono text-[10px] text-ink-faint">
            {{ s.aliases.length ? s.aliases.length + ' alias' + (s.aliases.length === 1 ? '' : 'es') : '—' }}
          </td>
        </tr>
        <tr v-if="!loading && stakeholders.length === 0">
          <td colspan="6" class="py-12 text-center text-ink-dim text-[13px]">
            No stakeholders match. Run reconciliation inbox to populate from ELK.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
# Browser: visit /stakeholders, verify table renders + filters work
git add apps/web/src/views/StakeholdersView.vue
git commit -m "feat(web): StakeholdersView — list + sektor/status/search filters"
```

---

## Task 7: StakeholderDetailView (graph hub)

**Files:**
- Modify: `apps/web/src/views/StakeholderDetailView.vue`

- [ ] **Step 1: Full view per OpenCTI graph-hub convention**

```vue
<script setup lang="ts">
import { toRef } from 'vue';
import { useStakeholder } from '@/composables/useStakeholder';
import SensorStatusPill from '@/components/stakeholder/SensorStatusPill.vue';
import SektorBadge from '@/components/stakeholder/SektorBadge.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const { stakeholder, loading, error } = useStakeholder(() => idRef.value);
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'stakeholders', to: '/stakeholders' },
          { label: stakeholder?.name ?? id, mono: !stakeholder },
        ]"
        class="mb-3"
      />
      <div v-if="stakeholder" class="flex flex-wrap items-baseline justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="font-mono text-[12px] text-ink-dim">{{ stakeholder.slug }}</span>
          <h1 class="text-[24px] font-medium text-ink tracking-tight">{{ stakeholder.name }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <SektorBadge :sektor="stakeholder.sektor" :clickable="true" />
          <SensorStatusPill :status="stakeholder.sensor.status" />
        </div>
      </div>
    </header>

    <p v-if="loading && !stakeholder" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>
    <p v-else-if="!stakeholder" class="text-[13px] text-ink-dim">stakeholder not found.</p>

    <template v-else>
      <!-- Aliases -->
      <section v-if="stakeholder.aliases.length" class="mb-8">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">aliases</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="a in stakeholder.aliases"
            :key="a"
            class="inline-flex px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim font-mono text-[11px]"
          >{{ a }}</span>
        </div>
      </section>

      <!-- City + coords -->
      <section class="mb-8 grid grid-cols-2 gap-x-12 gap-y-4">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">city</p>
          <p class="text-ink mt-1">{{ stakeholder.city ?? '—' }}</p>
        </div>
        <div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">coords (lon, lat)</p>
          <p class="font-mono text-ink mt-1 tabular-nums">
            {{ stakeholder.coords ? `${stakeholder.coords[0]}, ${stakeholder.coords[1]}` : '—' }}
          </p>
        </div>
      </section>

      <!-- Sensor deployment summary -->
      <section class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">sensor deployment</p>
        <div class="grid grid-cols-4 gap-x-8 gap-y-3">
          <div>
            <p class="font-mono text-[10px] text-ink-faint">stack</p>
            <p class="font-mono text-ink text-[13px] mt-1">{{ stakeholder.sensor.stack ?? '—' }}</p>
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">status</p>
            <SensorStatusPill :status="stakeholder.sensor.status" />
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">agents</p>
            <p class="font-mono text-ink text-[13px] mt-1 tabular-nums">{{ stakeholder.sensor.agentCount ?? '—' }}</p>
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">deployed</p>
            <p class="font-mono text-ink-dim text-[12px] mt-1">{{ stakeholder.sensor.deployedAt?.slice(0, 10) ?? '—' }}</p>
          </div>
        </div>
        <p v-if="stakeholder.sensor.notes" class="mt-3 text-[13px] text-ink-dim leading-6 whitespace-pre-line">
          {{ stakeholder.sensor.notes }}
        </p>
      </section>

      <!-- Notes -->
      <section v-if="stakeholder.notes" class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">notes</p>
        <p class="text-[13px] text-ink-dim leading-6 whitespace-pre-line max-w-[68ch]">{{ stakeholder.notes }}</p>
      </section>

      <!-- Footer metadata -->
      <footer class="border-t border-rule pt-4 font-mono text-[10px] text-ink-faint">
        created {{ stakeholder.createdAt.slice(0, 10) }} · updated {{ stakeholder.updatedAt.slice(0, 10) }}
      </footer>
    </template>
  </div>
</template>
```

> **Note:** Assets list / Cases list / Reconciliation history sections require additional GraphQL fields (`stakeholder.assets`, `stakeholder.cases`, `stakeholder.resolvedFrom`). Backend doesn't expose them yet — this iter shows the metadata + sensor sections. Add backend nested resolvers in a follow-up task; the view will gracefully render those sections when fields land.

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
# Browser: create a stakeholder via Playground → visit /stakeholders/<id>
git add apps/web/src/views/StakeholderDetailView.vue
git commit -m "feat(web): StakeholderDetailView — graph hub (header + sensor + notes + metadata)"
```

---

## Task 8: SuggestionList + RawStakeholderRow components

**Files:**
- Create: `apps/web/src/components/reconciliation/SuggestionList.vue`
- Create: `apps/web/src/components/reconciliation/RawStakeholderRow.vue`

- [ ] **Step 1: SuggestionList.vue**

```vue
<script setup lang="ts">
import type { StakeholderSuggestion } from '@/composables/useReconciliationInbox';

defineProps<{ suggestions: StakeholderSuggestion[] }>();

const reasonLabel: Record<string, string> = {
  'alias-match': 'alias',
  'levenshtein': 'fuzzy',
  'acronym-match': 'acronym',
  'domain-match': 'domain',
  'pattern-match': 'pattern',
};
</script>

<template>
  <div v-if="suggestions.length === 0" class="text-[12px] text-ink-faint italic font-mono">
    no suggestions — press N to create new, S to skip
  </div>
  <ol v-else class="space-y-1.5">
    <li v-for="(s, i) in suggestions.slice(0, 3)" :key="s.stakeholder.id" class="flex items-baseline justify-between gap-3">
      <div class="flex items-baseline gap-3 min-w-0">
        <span class="font-mono text-[11px] text-signal w-4">{{ i + 1 }}</span>
        <span class="text-ink truncate">{{ s.stakeholder.name }}</span>
        <span v-if="s.stakeholder.sektor" class="font-mono text-[10px] text-ink-faint">/ {{ s.stakeholder.sektor.slug }}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="font-mono text-[10px] text-ink-dim tabular-nums">{{ Math.round(s.confidence * 100) }}%</span>
        <span class="font-mono text-[9px] uppercase tracking-wider text-ink-faint border border-rule-strong px-1.5 py-0.5 rounded-sm">
          {{ reasonLabel[s.reason] ?? s.reason }}
        </span>
      </div>
    </li>
  </ol>
</template>
```

- [ ] **Step 2: RawStakeholderRow.vue**

```vue
<script setup lang="ts">
import type { RawStakeholder } from '@/composables/useReconciliationInbox';
import SuggestionList from './SuggestionList.vue';

defineProps<{ raw: RawStakeholder; isFocused: boolean }>();
</script>

<template>
  <article
    :class="[
      'border-l-2 pl-5 pr-4 py-4 transition',
      isFocused
        ? 'border-signal bg-surface'
        : 'border-rule hover:border-rule-strong hover:bg-surface/40',
    ]"
  >
    <header class="flex items-baseline justify-between gap-4 mb-3">
      <h3 class="text-ink text-[15px] font-medium">{{ raw.rawName }}</h3>
      <div class="flex items-baseline gap-4 font-mono text-[10px] text-ink-faint shrink-0">
        <span>sektor: <span class="text-ink-dim">{{ raw.rawSektor ?? '—' }}</span></span>
        <span class="tabular-nums">hits: <span class="text-ink-dim">{{ raw.hitCount.toLocaleString() }}</span></span>
        <span class="tabular-nums">targets: <span class="text-ink-dim">{{ raw.targetCount }}</span></span>
        <span>seen: <span class="text-ink-dim">{{ raw.lastSeen.slice(0, 10) }}</span></span>
      </div>
    </header>

    <SuggestionList :suggestions="raw.suggestions" />

    <footer
      v-if="isFocused"
      class="mt-4 pt-3 border-t border-rule-strong flex items-center gap-4 font-mono text-[10px] text-ink-faint flex-wrap"
    >
      <span class="text-ink-dim">action keys:</span>
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">1-3</kbd> pick suggestion
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">N</kbd> create new
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">M</kbd> merge with…
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">S</kbd> skip
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">X</kbd> reject
      <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">B</kbd> bulk
    </footer>
  </article>
</template>
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/components/reconciliation/
git commit -m "feat(web): SuggestionList + RawStakeholderRow components"
```

---

## Task 9: ReconciliationInboxView (keyboard-first)

**Files:**
- Create: `apps/web/src/components/reconciliation/CreateStakeholderSlide.vue`
- Modify: `apps/web/src/views/ReconciliationInboxView.vue`

- [ ] **Step 1: CreateStakeholderSlide.vue (slide-in form for "N" action)**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSektors } from '@/composables/useStakeholders';
import type { StakeholderInput } from '@/composables/useStakeholders';
import type { RawStakeholder } from '@/composables/useReconciliationInbox';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{ raw: RawStakeholder | null; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', input: StakeholderInput): void;
  (e: 'cancel'): void;
}>();

const { sektors } = useSektors();

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const slug = ref('');
const name = ref('');
const aliases = ref('');
const city = ref('');
const sektorId = ref('');
const notes = ref('');

watch(() => props.raw, (r) => {
  if (!r) return;
  name.value = r.rawName;
  slug.value = slugify(r.rawName);
  aliases.value = '';
  city.value = '';
  sektorId.value = '';
  notes.value = '';
}, { immediate: true });

function onSubmit(): void {
  if (!slug.value || !name.value) return;
  emit('submit', {
    slug: slug.value,
    name: name.value,
    aliases: aliases.value.split(',').map((a) => a.trim()).filter(Boolean),
    city: city.value || undefined,
    sektorId: sektorId.value || undefined,
    notes: notes.value || undefined,
  });
}
</script>

<template>
  <aside
    v-if="raw"
    class="fixed top-0 right-0 h-screen w-[480px] bg-base border-l border-rule-strong z-50 overflow-y-auto"
  >
    <div class="p-8">
      <header class="mb-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">create stakeholder from raw</p>
        <h2 class="text-[18px] text-ink mt-1">{{ raw.rawName }}</h2>
      </header>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <Input v-model="slug" label="Slug" required placeholder="kementerian-esdm" />
        <Input v-model="name" label="Display name" required />
        <Input v-model="aliases" label="Aliases (comma-separated)" placeholder="K-ESDM, Kemen ESDM" />
        <Input v-model="city" label="City" placeholder="Jakarta" />
        <label class="block">
          <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Sektor</span>
          <select v-model="sektorId" class="block h-9 w-full rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink">
            <option value="">— select sektor —</option>
            <option v-for="s in sektors" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Notes</span>
          <textarea
            v-model="notes"
            rows="3"
            class="block w-full rounded-md border border-rule-strong bg-surface p-3 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:ring-1 focus:ring-signal/30"
          />
        </label>

        <div class="flex items-center gap-3 pt-4">
          <Button type="submit" variant="primary" :loading="loading">Create + resolve</Button>
          <Button type="button" variant="ghost" @click="emit('cancel')">Cancel</Button>
        </div>
      </form>
    </div>
  </aside>
</template>
```

- [ ] **Step 2: ReconciliationInboxView.vue (full keyboard handler)**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useReconciliationInbox } from '@/composables/useReconciliationInbox';
import RawStakeholderRow from '@/components/reconciliation/RawStakeholderRow.vue';
import CreateStakeholderSlide from '@/components/reconciliation/CreateStakeholderSlide.vue';
import type { StakeholderInput } from '@/composables/useStakeholders';

const status = ref<'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW'>('PENDING');
const focusIdx = ref(0);
const slideOpen = ref(false);
const toast = ref<string | null>(null);
const loadingMutation = ref(false);

const {
  raws, counts, loading, refetch,
  resolve, reject, createFromRaw, recompute,
} = useReconciliationInbox(() => status.value);

const focused = computed(() => raws.value[focusIdx.value] ?? null);

function showToast(msg: string): void {
  toast.value = msg;
  setTimeout(() => { toast.value = null; }, 2500);
}

async function pickSuggestion(idx: number): Promise<void> {
  const raw = focused.value;
  if (!raw) return;
  const suggestion = raw.suggestions[idx];
  if (!suggestion) {
    showToast(`no suggestion #${idx + 1}`);
    return;
  }
  loadingMutation.value = true;
  try {
    await resolve(raw.id, suggestion.stakeholder.id);
    showToast(`resolved → ${suggestion.stakeholder.name}`);
    if (focusIdx.value >= raws.value.length - 1) focusIdx.value = Math.max(0, raws.value.length - 2);
  } finally {
    loadingMutation.value = false;
  }
}

async function rejectFocused(): Promise<void> {
  if (!focused.value) return;
  loadingMutation.value = true;
  try {
    await reject(focused.value.id, 'noise');
    showToast('rejected');
    if (focusIdx.value >= raws.value.length - 1) focusIdx.value = Math.max(0, raws.value.length - 2);
  } finally {
    loadingMutation.value = false;
  }
}

async function onCreateSubmit(input: StakeholderInput): Promise<void> {
  if (!focused.value) return;
  loadingMutation.value = true;
  try {
    await createFromRaw(focused.value.id, input);
    slideOpen.value = false;
    showToast(`created + resolved → ${input.name}`);
    if (focusIdx.value >= raws.value.length - 1) focusIdx.value = Math.max(0, raws.value.length - 2);
  } finally {
    loadingMutation.value = false;
  }
}

async function recomputeAll(): Promise<void> {
  loadingMutation.value = true;
  try {
    const n = await recompute();
    showToast(`recomputed ${n} suggestions`);
  } finally {
    loadingMutation.value = false;
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (slideOpen.value) return;
  // Ignore typing in inputs
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;

  switch (e.key.toLowerCase()) {
    case 'j':
    case 'arrowdown':
      e.preventDefault();
      focusIdx.value = Math.min(raws.value.length - 1, focusIdx.value + 1);
      break;
    case 'k':
    case 'arrowup':
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
      showToast('skipped');
      break;
    case 'x':
      e.preventDefault();
      rejectFocused();
      break;
    case 'm':
      e.preventDefault();
      showToast('merge mode — coming in v2');
      break;
    case 'b':
      e.preventDefault();
      showToast('bulk pattern — coming in v2');
      break;
    case 'r':
      if (e.shiftKey) {
        e.preventDefault();
        recomputeAll();
      }
      break;
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
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
        @click="status = s; focusIdx = 0"
      >{{ s.toLowerCase().replace('_', ' ') }}</button>
      <span class="ml-auto text-ink-faint text-[10px]">
        <kbd class="px-1.5 py-0.5 border border-rule-strong rounded-sm text-signal">⇧R</kbd> recompute
      </span>
    </div>

    <p v-if="loading && raws.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="raws.length === 0" class="text-[13px] text-ink-dim">
      no {{ status.toLowerCase() }} stakeholders. Run <span class="font-mono">pnpm bootstrap:stakeholders</span> from backend.
    </p>

    <div v-else class="space-y-3">
      <RawStakeholderRow
        v-for="(raw, i) in raws"
        :key="raw.id"
        :raw="raw"
        :is-focused="i === focusIdx"
        @click="focusIdx = i"
      />
    </div>

    <CreateStakeholderSlide
      v-if="slideOpen"
      :raw="focused"
      :loading="loadingMutation"
      @submit="onCreateSubmit"
      @cancel="slideOpen = false"
    />

    <Transition>
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md bg-surface border border-rule-strong font-mono text-[12px] text-ink z-50"
      >
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
# Browser: visit /admin/stakeholders/inbox, run pnpm bootstrap:stakeholders to populate raws
# Test: J/K nav, 1/2/3 pick, N create, S skip, X reject
git add apps/web/src/components/reconciliation/CreateStakeholderSlide.vue apps/web/src/views/ReconciliationInboxView.vue
git commit -m "feat(web): ReconciliationInboxView keyboard-first (J/K/1-3/N/S/X/B/M/⇧R)"
```

---

## Task 10: CasesView (list + filter)

**Files:**
- Modify: `apps/web/src/views/CasesView.vue`

- [ ] **Step 1: Full view**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCases, type CaseStatus, type CasesFilter } from '@/composables/useCases';
import CaseStatusBadge from '@/components/case/CaseStatusBadge.vue';
import CaseVerdictBadge from '@/components/case/CaseVerdictBadge.vue';
import Button from '@/components/ui/Button.vue';

const router = useRouter();

const search = ref('');
const statusFilter = ref<CaseStatus[]>(['DRAFT', 'ACTIVE']);

const filter = computed<CasesFilter>(() => ({
  search: search.value.trim() || null,
  status: statusFilter.value.length > 0 ? statusFilter.value : null,
}));

const { cases, loading } = useCases(() => filter.value);

function go(c: { id: string }): void {
  router.push({ name: 'case-detail', params: { id: c.id } });
}

const ALL_STATUSES: CaseStatus[] = ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'];
function toggleStatus(s: CaseStatus): void {
  const i = statusFilter.value.indexOf(s);
  if (i >= 0) statusFilter.value.splice(i, 1);
  else statusFilter.value.push(s);
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
            No cases. Click "+ New Case" to start.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/views/CasesView.vue
git commit -m "feat(web): CasesView — list + status multiselect filter"
```

---

## Task 11: CaseCreateView (3-step wizard)

**Files:**
- Modify: `apps/web/src/views/CaseCreateView.vue`

- [ ] **Step 1: Full view**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useStakeholders } from '@/composables/useStakeholders';
import { useCreateCase, type CaseInput } from '@/composables/useCases';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const router = useRouter();

const step = ref<1 | 2 | 3>(1);
const error = ref<string | null>(null);

// Step 1 state
const stakeholderSearch = ref('');
const selectedStakeholderId = ref<string | null>(null);
const { stakeholders } = useStakeholders(() => ({
  search: stakeholderSearch.value.trim() || null,
  status: 'ACTIVE',
}));
const selectedStakeholder = computed(() =>
  stakeholders.value.find((s) => s.id === selectedStakeholderId.value) ?? null,
);

// Step 2 state
const reportNo = ref('');
const title = ref('');
const trigger = ref('');
const summary = ref('');
const deployedAt = ref(new Date().toISOString().slice(0, 10));

const { submit, loading } = useCreateCase();

function next(): void {
  error.value = null;
  if (step.value === 1) {
    if (!selectedStakeholderId.value) {
      error.value = 'Pick a stakeholder';
      return;
    }
    step.value = 2;
  } else if (step.value === 2) {
    if (!reportNo.value.trim()) {
      error.value = 'reportNo is required';
      return;
    }
    if (!deployedAt.value) {
      error.value = 'deployedAt is required';
      return;
    }
    step.value = 3;
  }
}

function prev(): void {
  if (step.value > 1) step.value = (step.value - 1) as 1 | 2;
}

async function onSubmit(): Promise<void> {
  error.value = null;
  if (!selectedStakeholderId.value) return;
  const input: CaseInput = {
    reportNo: reportNo.value.trim(),
    title: title.value.trim() || undefined,
    trigger: trigger.value.trim() || undefined,
    summary: summary.value.trim() || undefined,
    stakeholderId: selectedStakeholderId.value,
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
      <div class="flex items-center gap-2 mt-4 font-mono text-[10px] text-ink-faint uppercase tracking-wider">
        <span :class="step >= 1 ? 'text-signal' : ''">01 stakeholder</span>
        <span class="text-ink-faint">·</span>
        <span :class="step >= 2 ? 'text-signal' : ''">02 metadata</span>
        <span class="text-ink-faint">·</span>
        <span :class="step >= 3 ? 'text-signal' : ''">03 confirm</span>
      </div>
    </header>

    <!-- Step 1 -->
    <section v-if="step === 1">
      <Input v-model="stakeholderSearch" type="search" label="Search stakeholder" placeholder="name substring" />
      <ul class="mt-4 space-y-1 max-h-[400px] overflow-y-auto">
        <li
          v-for="s in stakeholders"
          :key="s.id"
          :class="[
            'flex items-baseline justify-between px-3 py-2 cursor-pointer rounded-sm transition',
            selectedStakeholderId === s.id ? 'bg-surface border-l-2 border-signal' : 'hover:bg-surface/40',
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
    </section>

    <!-- Step 2 -->
    <section v-else-if="step === 2" class="space-y-4">
      <Input v-model="reportNo" label="Report No" required placeholder="001/CA/CTH/04/2026" />
      <Input v-model="title" label="Title" placeholder="optional" />
      <Input v-model="trigger" label="Trigger" placeholder="why this case" />
      <label class="block">
        <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Summary</span>
        <textarea v-model="summary" rows="4" class="block w-full rounded-md border border-rule-strong bg-surface p-3 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:ring-1 focus:ring-signal/30" />
      </label>
      <Input v-model="deployedAt" type="text" label="Deployed at (YYYY-MM-DD)" required />
    </section>

    <!-- Step 3 -->
    <section v-else>
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">confirm</p>
      <dl class="space-y-3 text-[13px]">
        <div class="flex justify-between border-b border-rule pb-2">
          <dt class="text-ink-faint">Stakeholder</dt>
          <dd class="text-ink">{{ selectedStakeholder?.name }}</dd>
        </div>
        <div class="flex justify-between border-b border-rule pb-2">
          <dt class="text-ink-faint">Report No</dt>
          <dd class="font-mono text-ink">{{ reportNo }}</dd>
        </div>
        <div v-if="title" class="flex justify-between border-b border-rule pb-2">
          <dt class="text-ink-faint">Title</dt>
          <dd class="text-ink">{{ title }}</dd>
        </div>
        <div v-if="trigger" class="flex justify-between border-b border-rule pb-2">
          <dt class="text-ink-faint">Trigger</dt>
          <dd class="text-ink truncate ml-4">{{ trigger }}</dd>
        </div>
        <div class="flex justify-between border-b border-rule pb-2">
          <dt class="text-ink-faint">Deployed</dt>
          <dd class="font-mono text-ink">{{ deployedAt }}</dd>
        </div>
      </dl>
    </section>

    <p v-if="error" class="mt-4 text-sev-crit text-[12px]">{{ error }}</p>

    <footer class="mt-8 flex items-center gap-3">
      <Button v-if="step > 1" type="button" variant="ghost" @click="prev">← Back</Button>
      <Button v-if="step < 3" type="button" variant="primary" @click="next">Next →</Button>
      <Button v-else type="button" variant="primary" :loading="loading" @click="onSubmit">Create case</Button>
    </footer>
  </div>
</template>
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/views/CaseCreateView.vue
git commit -m "feat(web): CaseCreateView — 3-step wizard (stakeholder → metadata → confirm)"
```

---

## Task 12: CaseDetailView (header + 3 placeholder tabs)

**Files:**
- Modify: `apps/web/src/views/CaseDetailView.vue`

- [ ] **Step 1: Full view**

```vue
<script setup lang="ts">
import { ref, toRef, computed } from 'vue';
import { useCase } from '@/composables/useCase';
import CaseStatusBadge from '@/components/case/CaseStatusBadge.vue';
import CaseVerdictBadge from '@/components/case/CaseVerdictBadge.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const { case: caseDetail, loading, error } = useCase(() => idRef.value);

type Tab = 'summary' | 'artifacts' | 'timeline';
const activeTab = ref<Tab>('summary');

const counts = computed(() => caseDetail.value?.artifactsByType ?? {
  ioc: 0, file: 0, process: 0, network: 0, registry: 0, persistence: 0,
  account: 0, logFinding: 0, memory: 0, detectionHit: 0, note: 0,
});

const toast = ref<string | null>(null);
function showToast(msg: string): void {
  toast.value = msg;
  setTimeout(() => { toast.value = null; }, 2200);
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'cases', to: '/cases' },
          { label: caseDetail?.reportNo ?? id, mono: true },
        ]"
        class="mb-3"
      />
      <div v-if="caseDetail" class="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p class="font-mono text-[14px] text-ink">{{ caseDetail.reportNo }}</p>
          <h1 v-if="caseDetail.title" class="text-[22px] text-ink mt-1 font-medium tracking-tight">{{ caseDetail.title }}</h1>
          <p class="text-ink-dim text-[13px] mt-1">{{ caseDetail.stakeholder.name }} · {{ caseDetail.stakeholder.city ?? 'no city' }}</p>
        </div>
        <div class="flex items-center gap-3">
          <CaseStatusBadge :status="caseDetail.status" />
          <CaseVerdictBadge :verdict="caseDetail.verdict" />
        </div>
      </div>
    </header>

    <p v-if="loading && !caseDetail" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>
    <p v-else-if="!caseDetail" class="text-[13px] text-ink-dim">case not found.</p>

    <template v-else>
      <!-- Tabs -->
      <nav class="flex items-center gap-6 border-b border-rule mb-6 font-mono text-[11px] uppercase tracking-wider">
        <button
          v-for="t in (['summary', 'artifacts', 'timeline'] as const)"
          :key="t"
          type="button"
          :class="['py-2 -mb-px border-b-2 transition', activeTab === t ? 'text-ink border-signal' : 'text-ink-faint border-transparent hover:text-ink-dim']"
          @click="activeTab = t"
        >{{ t }} <span v-if="t === 'artifacts'" class="ml-1 text-ink-faint">{{ caseDetail.artifactCount }}</span></button>
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

      <!-- Artifacts tab (counts only — forms defer to v2) -->
      <section v-else-if="activeTab === 'artifacts'">
        <div class="flex items-center gap-3 mb-6">
          <Button variant="primary" @click="showToast('per-type artifact form — coming in UI v2')">+ Add Artifact</Button>
          <Button variant="ghost" @click="showToast('bulk paste IOC — coming in UI v2')">Bulk paste IOC</Button>
          <Button variant="ghost" @click="showToast('Wazuh import — coming in UI v2')">Import Wazuh</Button>
        </div>

        <div class="grid grid-cols-4 gap-4">
          <div v-for="(count, key) in counts" :key="key" class="border border-rule rounded-md p-4">
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ String(key) }}</p>
            <p class="font-mono text-[24px] text-ink mt-2 tabular-nums">{{ count }}</p>
          </div>
        </div>

        <p class="mt-8 text-[12px] text-ink-faint italic">
          Per-type artifact create forms (11 types) shipping in UI v2.
          Backend ready — see <span class="font-mono">apps/backend/src/artifacts/</span>.
        </p>
      </section>

      <!-- Timeline tab placeholder -->
      <section v-else>
        <p class="text-[13px] text-ink-dim">
          Timeline view shipping in UI v2 (chronological feed of artifacts by observedAt).
        </p>
      </section>
    </template>

    <Transition>
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md bg-surface border border-rule-strong font-mono text-[12px] text-ink z-50"
      >
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @helyx/web exec vue-tsc --noEmit
git add apps/web/src/views/CaseDetailView.vue
git commit -m "feat(web): CaseDetailView — header + 3 tabs (summary / artifacts counts / timeline placeholder)"
```

---

## Task 13: End-to-end browser verify

- [ ] **Step 1: Run dev servers**

```bash
pnpm db:up  # neo4j + redis
# Terminal 1:
pnpm --filter @helyx/backend dev
# Terminal 2:
pnpm --filter @helyx/web dev
```

- [ ] **Step 2: Login flow**

Open http://localhost:5173/login. Use `verify2@helyx.test` / `VerifyPass123!` (from Phase 3 verify) or register a fresh user. After login, dev tools > Application > Cookies should show `helyx_session`, `helyx_csrf_token`, `helyx_refresh`.

- [ ] **Step 3: Walk through each new route**

| Route | Verify |
|---|---|
| /stakeholders | Empty state shows "Run reconciliation inbox to populate". Sektor dropdown lists 17. Search input works. |
| /admin/stakeholders/inbox | Empty state shows ELK bootstrap hint. Run `pnpm --filter @helyx/backend bootstrap:stakeholders -- --tenant <orgId>` first to populate. Then test J/K nav, 1-3 pick, N create, S skip, X reject, ⇧R recompute. |
| /stakeholders/:id | Sektor + sensor + city + coords + notes + metadata footer all render. |
| /cases | Empty state shows "+ New Case". |
| /cases/new | Wizard step 1 (stakeholder pick) → step 2 (metadata) → step 3 (confirm) → submit creates case + redirects to detail. |
| /cases/:id | Header with reportNo + status/verdict. 3 tabs render. Artifacts tab shows 11-grid of zero counts + 3 "coming soon" buttons. |

- [ ] **Step 4: Commit (if any browser-discovered fix needed)**

```bash
git commit -am "fix(web): <description from browser verify>"
```

If nothing breaks, no commit. Phase 1 admin UI complete.

---

## Self-Review Checklist (post-write)

**Spec coverage:**
- [x] Phase A routes + nav + composables → Tasks 1-4
- [x] Phase B Stakeholder list + detail → Tasks 6-7
- [x] Phase C Reconciliation inbox keyboard-first → Tasks 8-9
- [x] Phase D Case list + create + detail (no artifact forms) → Tasks 10-12
- [x] End-to-end verify → Task 13

**Out-of-scope acknowledged:** 11 artifact forms, bulk paste UI, Wazuh import UI, Findings/Timeline content, edit/close case UI, merge/bulk in inbox, recently-used host, templates.

**No placeholders verified.** Each task has full code (Vue SFC, TS, shell). "Coming soon" toasts are intentional UX, not placeholder dev work.

**Type/symbol consistency:**
- `Stakeholder`/`Sektor`/`SensorSummary` types defined in useStakeholders.ts, re-exported by useStakeholder + useReconciliationInbox + useCases ✓
- `CaseSummary` extends to `CaseDetail` (in useCase.ts) — additive, no breaking ✓
- `CaseStatus` / `CaseVerdict` / `ArtifactCounts` consistent across composables + components ✓
- `StakeholderInput` shared between create and create-from-raw ✓

**Cross-task dependencies:**
- T1 (routes + stubs) gates T6-T12 (views need routes to exist)
- T2 (useStakeholders) gates T6, T7, T9, T11
- T3 (useReconciliationInbox) gates T8, T9
- T4 (useCases) gates T10, T11, T12
- T5 (badges) used by T6, T10, T12
- T8 (RawStakeholderRow) gates T9
- T13 (browser verify) gates Phase 1 completion

**Parallelizable:**
- After T1: T2 + T3 + T4 + T5 can run parallel (independent files)
- After T2-T5: T6 + T7 + T8 can run parallel
- T9 + T10 + T11 + T12 can run parallel (independent views)
- T13 sequential at end

**Total tasks: 13.** Estimated execution: 1 sesi if parallel-heavy (sub-3 hours), 2 sesi if sequential.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-helyx-admin-ui-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task. Best because views are independent — heavy parallelism after T1.

**2. Inline Execution** — Faster but heavier on this session's context.

**Which approach?** And: do you want me to run `/autoplan` on this plan first (CEO/Eng/DX review with Copilot+Gemini dual voice — Codex still 402)?

---

<!-- AUTONOMOUS DECISION LOG -->
## /autoplan Review — Decision Audit Trail (subagent-only mode)

### Phase 1: CEO Review

| # | Phase | Finding | Severity | Decision |
|---|-------|---------|----------|----------|
| 1 | CEO | No auth guard on /admin/stakeholders/inbox route meta | **CRITICAL** | **AUTO-FIX** Task 1: add `meta: { requiresRole: 'ADMIN' }`; check existing router auth gate pattern |
| 2 | CEO | "Coming soon" buttons in case detail Artifacts tab = broken-button anti-pattern | **CRITICAL** | **AUTO-FIX** Task 12: REMOVE 3 buttons entirely until forms ship in v2. Replace with single "0 artifacts" empty state copy |
| 3 | CEO | 3-step wizard wrong — confirm step adds zero value for ADMIN data shape | HIGH | **AUTO-FIX** Task 11: collapse to single-page form, no confirm step |
| 4 | CEO | Error handling missing on mutation wrappers in useReconciliationInbox | HIGH | **AUTO-FIX** Task 3: wrap each mutate() call with try/catch, return { ok, error } shape; surface error via toast in view |
| 5 | CEO | closeCase verdict UI missing — operators can't progress lifecycle without Playground | HIGH | **AUTO-ADD** new Task 12b: closeCase modal in CaseDetailView header (ACTIVE → CLOSED + verdict picker) |
| 6 | CEO | 11 empty artifact tabs look broken (Findings + Timeline placeholder also) | HIGH | **AUTO-FIX** Task 12: SHOW 2 TABS ONLY (Summary + Artifacts). Drop Timeline placeholder. Artifacts tab = single "0 artifacts" empty state, not 11-grid |
| 7 | CEO | Wizard stakeholder picker has no loading state | HIGH | **AUTO-FIX** Task 11: loading row inside `<ul>` while query in-flight |
| 8 | CEO | Toast logic copy-pasted 2x — violates CLAUDE.md "no copy-paste" + "shared components" | MEDIUM | **AUTO-FIX** new Task 5b: extract `useToast()` composable + Toast.vue component, wire into both views |
| 9 | CEO | B/M keyboard hints lie (toast "coming v2") — pollutes keyboard-first differentiator | MEDIUM | **AUTO-FIX** Task 8: REMOVE B + M from kbd hint footer until features ship |
| 10 | CEO | CasesView empty state doesn't differentiate "no data" vs "no match" | MEDIUM | **AUTO-FIX** Task 10: branch empty state on filter active vs not |
| 11 | CEO | useStakeholders pagination hardcoded first:100 — silent truncation when >100 | MEDIUM | **AUTO-DOC** Out of scope section: flag pagination as v2 task |
| 12 | CEO | StakeholderDetailView Assets/Cases skeleton sections undefined | MEDIUM | **AUTO-FIX** Task 7: spec the placeholder shape (e.g., "0 assets · backend resolver pending — see TODOS") |
| 13 | CEO | bg-base CSS var name wrong (not in documented design tokens) | LOW | **AUTO-FIX** Task 9 CreateStakeholderSlide: change `bg-base` → `bg-[var(--bg)]` or use existing tailwind token (verify what `bg-base` actually maps to in tailwind config first) |
| 14 | CEO | deployedAt input type=text, no date picker, silent Invalid Date if malformed | LOW | **AUTO-FIX** Task 11: change input type=date + validate ISO before submit |


### Phase 2: Design Review

| # | Phase | Finding | Severity | Decision |
|---|-------|---------|----------|----------|
| 15 | Design | useStakeholders no `error` ref → network failure = silent empty table | **CRITICAL** | **AUTO-FIX** Task 2: expose error ref from composable; Task 6 surface it as banner |
| 16 | Design | B/M keys at `text-signal` but toast "v2" — UX trust trap | **CRITICAL** | DUP of CEO #9. Confirm fix: hide B/M from kbd hint footer entirely, NOT show as ink-faint either |
| 17 | Design | Mutation loading not applied to focused row visually — double-key risk | HIGH | **AUTO-FIX** Task 9: apply `opacity-50 pointer-events-none` to focused row when loadingMutation true |
| 18 | Design | No backdrop-click-close on CreateStakeholderSlide | HIGH | **AUTO-FIX** Task 9: add backdrop overlay; click outside closes; ESC closes |
| 19 | Design | leadUserId missing from CaseCreateView step 2 form | HIGH | **AUTO-FIX** Task 11: add lead user selector. Backend doesn't yet expose `users` query — use freeform text input + TODO comment, OR defer with explicit "leads can be set via update later" note |
| 20 | Design | `ACTIVE` case badge uses `sev-high` (orange) — semantic mismatch with operational state | HIGH | **AUTO-FIX** Task 5 CaseStatusBadge: ACTIVE → `bg-signal/15 text-signal border-signal/30` (signal = active focus, not severity) |
| 21 | Design | Add Artifact button only visible after clicking Artifacts tab — primary action below fold | HIGH | **AUTO-FIX** Task 12: surface primary "Add Artifact" in CaseDetailView header (with closeCase button if status=ACTIVE per CEO #5) |
| 22 | Design | All 3 views missing FORBIDDEN/network error boundaries | HIGH | **AUTO-FIX** Task 13 verify: confirm Apollo errorLink already routes 401/403 globally — verify; if not, add per-view error display |
| 23 | Design | Confidence % at text-[10px] not glanceable for 5sec/row sprint | MEDIUM | **AUTO-FIX** Task 8 SuggestionList: add 4px confidence bar (bg-signal/30 fill over bg-rule track), width = confidence% |
| 24 | Design | CreateStakeholderSlide no CSS transition — hard-cut | MEDIUM | **AUTO-FIX** Task 9: wrap in `<Transition>` with translate-x animation |
| 25 | Design | Signal color overuse on all 6 kbd boxes dilutes attention role | MEDIUM | **AUTO-FIX** Task 8 RawStakeholderRow: signal only on 1/2/3 + N (primary actions); ink-dim on S/X (escape actions); hide B/M entirely |
| 26 | Design | 11 zero-count artifact cards visual noise on new case | MEDIUM | **AUTO-FIX** Task 12 (combined with CEO #6): collapse to "0 artifacts — add the first one" empty state when sum(counts)==0; show non-zero types only |
| 27 | Design | StakeholdersView column order slug-first obscures name/where | MEDIUM | **AUTO-FIX** Task 6: reorder cols → name → sektor → city → sensor → slug → aliases. Slug becomes meta col with `text-ink-faint` |
| 28 | Design | StakeholdersView empty state doesn't differentiate filtered vs no-data | MEDIUM | **AUTO-FIX** Task 6 (combined with CEO #10 for cases): differentiate empty states |
| 29 | Design | Tab count refetch on artifact mutation not specified — implementer will miss | MEDIUM | **AUTO-DOC** Add comment in useCase.ts: "consumers MUST call refetch after artifact mutations until subscriptions land" |
| 30 | Design | Breadcrumb shows raw UUID before data loads | LOW | **AUTO-FIX** Task 7 + 12: replace `id` fallback with `'Loading…'` skeleton |


### Phase 3: Eng Review

| # | Phase | Finding | Severity | Decision |
|---|-------|---------|----------|----------|
| 31 | Eng | Router `beforeEach` only checks `auth.isAuthed` — auth store has no `activeOrgRole` field at all | **CRITICAL** | **AUTO-FIX** Task 1 expanded: add `activeOrgRole` to auth store + populate on login (from useMe query), persist; extend `beforeEach` to read role from store + redirect on requiresRole mismatch |
| 32 | Eng | Rapid-keypress race in inbox: 1 then 2 fires 2 concurrent resolves on same row | **CRITICAL** | **AUTO-FIX** Task 9: add `if (loadingMutation.value) return;` at top of onKeyDown BEFORE switch |
| 33 | Eng | useMutation calls missing generic type params — silent runtime type unsafety | HIGH | **AUTO-FIX** Task 3 useReconciliationInbox: add explicit `useMutation<ResultType, VarsType>` to all 5 calls; remove `as` casts |
| 34 | Eng | useCases doesn't send `$offset` arg → pagination silently broken | HIGH | **AUTO-FIX** Task 4: add offset to CASES query + composable signature; Task 10 CasesView pass page state |
| 35 | Eng | No debounce on search inputs — every keystroke = network request | HIGH | **AUTO-FIX** Tasks 6, 11: install `@vueuse/core` if not present, wrap search refs with `useDebounceFn(300)` before passing to filter |
| 36 | Eng | No stale-cache recovery after 30+ min idle — stale rawId on keypress | HIGH | **AUTO-FIX** Task 9: add `document.addEventListener('visibilitychange')` → call `refetch()` on visible-again |
| 37 | Eng | VIEWER gets silent empty-loading on FORBIDDEN, not redirect | HIGH | **AUTO-FIX** Task 9 + maybe Apollo errorLink: surface FORBIDDEN as toast + redirect / |
| 38 | Eng | bg-base flagged in CEO #13 is actually CORRECT (Tailwind config has theme.extend.colors.base = var(--bg)) | INVALID | **RETRACT** CEO #13 — bg-base is a valid Tailwind class. No fix needed. |
| 39 | Eng | useStakeholders exposes no `error` ref | MEDIUM | DUP Design #15. Confirm: expose error ref. |
| 40 | Eng | deployedAt UTC midnight is intentional but should be commented (Indonesian timezone trap awareness) | LOW | **AUTO-FIX** Task 11: add `// Stored as UTC midnight per project convention; displayed as date-only` comment |

### Phase 3.5 (DX): SKIPPED

Plan is admin UI for human security analysts, not a developer-facing API/SDK/CLI product. The 48 DX matches in scope detection are incidental references to existing pnpm CLI commands in verify steps, not first-class DX surface. DX review N/A.

### Cross-phase themes

**Theme 1 (CRITICAL) — Auth/role enforcement gap.** CEO #1 + Eng #31 both caught: ADMIN-only route has no frontend guard AND auth store lacks role state. Real security exposure: VIEWER can see admin UI, attempt mutations (backend rejects but UX broken).

**Theme 2 (CRITICAL) — Broken-button anti-pattern.** CEO #2 + Design #16 both caught: "Coming soon" toasts on primary action buttons train operators to distrust the product. CRITICAL because BSSN/TNI demo target.

**Theme 3 (HIGH) — Missing error surfacing.** CEO #4 + Design #15+22 + Eng #37+39 all caught: composables don't expose error refs, views don't render errors, mutations fail silently. Affects every feature.

**Theme 4 (HIGH) — UX trust traps.** CEO #9 + Design #16+25 + Eng (kbd display) all caught: showing actions/keys that don't work (B/M, "coming soon") undermines the keyboard-first differentiator.

**Theme 5 (MEDIUM) — Code duplication.** CEO #8 caught: toast logic duplicated 2x violates CLAUDE.md "no copy-paste" rule. Should extract useToast() composable.


---

## Pre-Execute Revision Delta (READ BEFORE EACH TASK)

`/autoplan` review found 4 CRITICAL + 18 HIGH + 13 MEDIUM issues. Two new gating tasks added (T0.5 above + T5b below + T12b below). For tasks 1-13, the delta below ENRICHES the original task body — read both. Apply the delta during execution.

### Task 1 deltas (Routes + Sidebar)
- **CRITICAL:** Add `meta: { requiresRole: 'ADMIN' }` to `/admin/stakeholders/inbox` route — DONE in plan body above ✓
- Sidebar nav: when rendering "Reconciliation Inbox" link, hide it via `v-if="auth.activeOrgRole === 'ADMIN' || auth.activeOrgRole === 'OWNER'"` so VIEWERs don't see the link

### Task 2 deltas (useStakeholders + useStakeholder)
- **CRITICAL #15:** Expose `error` ref from both composables. Pattern: `return { stakeholders, loading, error, refetch };` where `error` comes from `useQuery`'s 4th destructured value
- **HIGH #4:** Same for useStakeholder

### Task 3 deltas (useReconciliationInbox)
- **HIGH #33:** Add explicit generics to all 5 `useMutation<ResultShape, VarsShape>(GQL)`. Drop the `as` casts in mutate wrappers — use the typed `r.data` directly
- **HIGH #4:** Each mutation wrapper returns `{ ok: boolean, error: string | null, data: T | null }` shape. Caller-safe error surfacing instead of throwing
- Example for resolve:
  ```typescript
  resolve: async (rawId, stakeholderId): Promise<{ ok: boolean; error: string | null }> => {
    try {
      const r = await resolveM.mutate({ rawId, stakeholderId });
      refetchAll();
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
  ```

### Task 4 deltas (useCases + useCase)
- **HIGH #34:** Add `offset?: number` to CasesFilter + send `$offset: Int = 0` in CASES query → enables pagination
- **MEDIUM #29:** Add JSDoc comment to `useCase`: "Consumers MUST call `refetch()` after artifact mutations until subscriptions land — tab counts otherwise stale"

### Task 5 deltas (badges)
- **HIGH #20:** `CaseStatusBadge` ACTIVE color → `'bg-signal/15 text-signal border-signal/30'` (NOT sev-high). ACTIVE is operational state, not severity. Sev-high reserved for verdict.

### Task 5b NEW: useToast composable + Toast.vue (CLAUDE.md DRY compliance)

**Why:** Toast logic duplicated in 2 views violates "no copy-paste" rule. CEO #8.

**Files:**
- Create: `apps/web/src/composables/useToast.ts`
- Create: `apps/web/src/components/ui/Toast.vue`

```typescript
// composables/useToast.ts
import { ref, readonly } from 'vue';

export type ToastVariant = 'info' | 'success' | 'error';

const message = ref<string | null>(null);
const variant = ref<ToastVariant>('info');
let timer: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  function show(msg: string, v: ToastVariant = 'info', durationMs = 2500): void {
    message.value = msg;
    variant.value = v;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { message.value = null; }, durationMs);
  }
  function clear(): void {
    if (timer) clearTimeout(timer);
    message.value = null;
  }
  return { message: readonly(message), variant: readonly(variant), show, clear };
}
```

```vue
<!-- components/ui/Toast.vue -->
<script setup lang="ts">
import { useToast } from '@/composables/useToast';
const { message, variant } = useToast();

const variantClass: Record<string, string> = {
  info: 'border-rule-strong text-ink',
  success: 'border-sev-low/40 text-sev-low',
  error: 'border-sev-crit/40 text-sev-crit',
};
</script>

<template>
  <Transition>
    <div
      v-if="message"
      :class="['fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md bg-surface border font-mono text-[12px] z-50', variantClass[variant]]"
    >
      {{ message }}
    </div>
  </Transition>
</template>
```

Mount `<Toast />` once in `App.vue` (root) so any component calling `useToast().show(...)` triggers it. Tasks 9, 11, 12 use `useToast` instead of inline.

Verify: `pnpm --filter @helyx/web exec vue-tsc --noEmit`. Commit: `feat(web): useToast composable + Toast.vue (DRY toast pattern)`

### Task 6 deltas (StakeholdersView)
- **MEDIUM #27:** Reorder `<thead>` columns: name → sektor → city → sensor → slug → aliases. Slug uses `text-ink-faint` (metadata), name uses `text-ink` (primary)
- **MEDIUM #28:** Empty state branches:
  - `!loading && stakeholders.length === 0 && !filterActive` → "No stakeholders yet — run reconciliation inbox to populate"
  - `!loading && stakeholders.length === 0 && filterActive` → "No stakeholders match your filter — clear filters"
  - Where `filterActive = Boolean(search.value || sektorSlugFilter.value || statusFilter.value !== 'ACTIVE')`
- **HIGH #35:** Debounce search via VueUse `useDebounceFn(300)` before passing to filter computed. Install if needed: `pnpm --filter @helyx/web add @vueuse/core`
- **CRITICAL #15:** Surface error from useStakeholders as banner above table

### Task 7 deltas (StakeholderDetailView)
- **MEDIUM #12:** Define Assets/Cases skeleton sections — even though backend resolvers don't expose `stakeholder.assets` or `stakeholder.cases` yet, render placeholder sections:
  ```vue
  <section class="mb-8 border-t border-rule pt-6">
    <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">linked assets</p>
    <p class="text-[12px] text-ink-faint italic">Backend resolver pending — see TODOS Phase 2.5</p>
  </section>
  <section class="mb-8 border-t border-rule pt-6">
    <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">cases</p>
    <p class="text-[12px] text-ink-faint italic">Backend resolver pending — see TODOS Phase 2.5</p>
  </section>
  ```
- **LOW #30:** Breadcrumb fallback: replace `id` with `'Loading…'` while data unloaded

### Task 8 deltas (SuggestionList + RawStakeholderRow)
- **CRITICAL #16:** REMOVE B and M `<kbd>` from RawStakeholderRow footer entirely. Don't show actions that don't work
- **MEDIUM #25:** Signal color only on 1/2/3/N kbd (primary actions). S/X use `text-ink-dim border-rule-strong`
- **MEDIUM #23:** SuggestionList — add 4px-tall confidence bar above each row's confidence text:
  ```vue
  <div class="h-1 bg-rule rounded-[1px] overflow-hidden mt-0.5 w-16">
    <div class="h-full bg-signal/50" :style="{ width: (s.confidence * 100) + '%' }" />
  </div>
  ```
  Glanceable at sprint speed.

### Task 9 deltas (ReconciliationInboxView) — heavy update
- **CRITICAL #32:** First line of `onKeyDown`: `if (loadingMutation.value) return;` BEFORE the switch. Race-fix.
- **HIGH #17:** Apply `:class="['...', loadingMutation && i === focusIdx ? 'opacity-50 pointer-events-none' : '']"` to the focused row container
- **HIGH #18:** CreateStakeholderSlide → add backdrop overlay `<div @click="$emit('cancel')" class="fixed inset-0 bg-base/40 backdrop-blur-sm z-40" />`. Also handle ESC key to close.
- **MEDIUM #24:** Slide enters with `<Transition enter-active-class="transition-transform duration-200" enter-from-class="translate-x-full" leave-active-class="transition-transform duration-200" leave-to-class="translate-x-full">` for slide animation
- **HIGH #36:** Add `document.addEventListener('visibilitychange', () => { if (!document.hidden) refetch(); })` in onMounted; remove on unmount. Stale-cache recovery.
- **HIGH #37:** When `listQ.error` fires (FORBIDDEN or network), use `useToast().show(error.message, 'error')` + redirect to / if FORBIDDEN
- **CRITICAL #4:** Use `useToast()` for all toast calls (replace local `toast` ref)
- Replace local `toast` ref + `showToast()` with `const { show: showToast } = useToast()`. Mutation wrappers return error → `showToast(result.error, 'error')` if not ok

### Task 10 deltas (CasesView)
- **MEDIUM #10:** Empty state branch — same pattern as Task 6 delta
- **HIGH #35:** Debounce search via useDebounceFn(300)
- **HIGH #34:** Add `offset` state + Prev/Next pagination buttons (basic, no virtual scroll)

### Task 11 deltas (CaseCreateView) — significant update
- **HIGH #3 + Premise B:** **DROP STEP 3 entirely.** Wizard becomes 2 steps: pick stakeholder → fill metadata + submit. Remove `step.value === 3` branch + Confirm UI + extra Next button
- **HIGH #19:** Add `leadUserId` field to step 2. Backend doesn't expose `users(orgId)` query yet — use freeform text input:
  ```vue
  <Input v-model="leadUserId" label="Lead User ID (optional, paste UUID)" placeholder="leave empty if no lead yet" />
  ```
  Add `// TODO: replace with user picker when users(orgId) query lands` comment.
- **HIGH #7:** Stakeholder picker `<ul>` — add loading row inside while query fetching:
  ```vue
  <li v-if="loading" class="px-3 py-2 text-ink-dim text-[13px] italic">searching…</li>
  ```
- **HIGH #35:** Debounce stakeholderSearch
- **LOW #14:** Change `<Input v-model="deployedAt" type="text" />` to `type="date"`. Validate before submit: `if (!/^\d{4}-\d{2}-\d{2}$/.test(deployedAt.value)) { error = 'Invalid date'; return; }`
- **LOW #40:** Add comment near deployedAt conversion: `// Stored as UTC midnight per project convention; displayed as date-only`

### Task 12 deltas (CaseDetailView) — CRITICAL changes
- **CRITICAL #2:** **REMOVE the 3 "coming soon" buttons entirely** (Add Artifact / Bulk paste / Import Wazuh). Will be added in UI v2 when forms land. Hide is always better than placeholder.
- **HIGH #6:** Show only **2 tabs** — Summary and Artifacts (drop Timeline placeholder). Re-add Timeline tab in v2 when content exists.
- **HIGH + MEDIUM #26:** Artifacts tab content — collapse 11-grid:
  - If `caseDetail.artifactCount === 0`: render single empty state "No artifacts yet — artifact form lands in UI v2"
  - If > 0: render only NON-ZERO type cards (filter `Object.entries(counts).filter(([_, n]) => n > 0)`). Zero types stay hidden.
- **HIGH #5 + Design #21:** Surface "Close case" button in header IF `status === 'ACTIVE'`. Wire to closeCase modal (Task 12b below)
- **LOW #30:** Breadcrumb fallback: `id` → `'Loading…'` while data unloaded
- Replace local toast with `useToast()` (DRY)

### Task 12b NEW: closeCase verdict modal

**Why:** Operators need UI path to progress ACTIVE → CLOSED with verdict. Without this they'd resort to GraphQL Playground for the most important CA workflow transition. CEO #5.

**Files:**
- Create: `apps/web/src/components/case/CloseCaseModal.vue`
- Modify: `apps/web/src/composables/useCase.ts` — add `useCloseCase` mutation hook
- Modify: `apps/web/src/views/CaseDetailView.vue` — wire button + modal

```typescript
// In useCase.ts, append:
const CLOSE_CASE = gql`
  mutation CloseCase($id: ID!, $verdict: CaseVerdict!) {
    closeCase(id: $id, verdict: $verdict) {
      id status verdict closedAt
    }
  }
`;
export function useCloseCase() {
  const { mutate, loading, error } = useMutation<
    { closeCase: Pick<CaseDetail, 'id' | 'status' | 'verdict' | 'closedAt'> },
    { id: string; verdict: 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN' }
  >(CLOSE_CASE);
  async function submit(id: string, verdict: 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN') {
    try {
      const r = await mutate({ id, verdict });
      return { ok: true, data: r?.data?.closeCase ?? null, error: null };
    } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }
  }
  return { submit, loading, error };
}
```

```vue
<!-- components/case/CloseCaseModal.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', verdict: 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN'): void;
  (e: 'cancel'): void;
}>();

const verdict = ref<'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN'>('CONFIRMED');

const verdictMeta: Record<string, { label: string; color: string; help: string }> = {
  CONFIRMED: { label: 'Confirmed compromise', color: 'text-sev-crit', help: 'Evidence of active compromise found' },
  INCONCLUSIVE: { label: 'Inconclusive', color: 'text-sev-med', help: 'Evidence insufficient — neither confirms nor rules out' },
  CLEAN: { label: 'Clean', color: 'text-sev-low', help: 'No evidence of compromise' },
};
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-base/60 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative bg-surface border border-rule-strong rounded-md p-8 w-[420px] z-10">
        <header class="mb-6">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">close case</p>
          <h2 class="text-[18px] text-ink mt-1">Pick verdict</h2>
        </header>

        <div class="space-y-2 mb-6">
          <label
            v-for="v in (['CONFIRMED', 'INCONCLUSIVE', 'CLEAN'] as const)"
            :key="v"
            :class="[
              'flex items-start gap-3 px-3 py-3 rounded-md border cursor-pointer transition',
              verdict === v ? 'border-signal bg-base' : 'border-rule hover:border-rule-strong',
            ]"
          >
            <input v-model="verdict" type="radio" :value="v" class="mt-1" />
            <div>
              <p :class="['font-medium text-[13px]', verdictMeta[v].color]">{{ verdictMeta[v].label }}</p>
              <p class="text-[11px] text-ink-dim mt-0.5">{{ verdictMeta[v].help }}</p>
            </div>
          </label>
        </div>

        <div class="flex items-center gap-3">
          <Button type="button" variant="primary" :loading="loading" @click="emit('submit', verdict)">
            Close case as {{ verdict.toLowerCase() }}
          </Button>
          <Button type="button" variant="ghost" @click="emit('cancel')">Cancel</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

In CaseDetailView.vue header (when `caseDetail.status === 'ACTIVE'`):
```vue
<Button v-if="caseDetail.status === 'ACTIVE'" variant="primary" @click="closeOpen = true">Close case</Button>
<CloseCaseModal :open="closeOpen" :loading="closeLoading" @submit="onClose" @cancel="closeOpen = false" />
```

Wire `onClose` to `useCloseCase().submit()` + refetch + toast success/error.

Verify + commit: `feat(web): closeCase modal — verdict picker + lifecycle transition UI`

### Task 13 deltas (e2e verify)
- Add verify steps: VIEWER user navigates /admin/stakeholders/inbox → expects redirect to / with banner
- Verify CloseCase modal: ACTIVE case → close button visible → click → pick verdict → submit → status badge updates

---

## Revision summary table (40 findings → 32 actionable, 1 retracted, 7 deferred)

| Severity | Count | Status |
|---|---|---|
| CRITICAL | 4 | All baked into plan body or NEW tasks (T0.5, T5b, T12b) ✓ |
| HIGH | 18 | All baked via deltas above ✓ |
| MEDIUM | 13 | Most baked via deltas; pagination + tab subscription noted as v2 |
| LOW | 2 | Both fixed via deltas (LOW #14 deployedAt, LOW #30 breadcrumb) |
| INVALID | 1 | CEO #13 (bg-base) RETRACTED per Eng #38 verification |
| DEFERRED | 7 | Pagination >100, virtual scroll, full users() query, full subscription tab updates, full Findings/Timeline content, full bulk paste, Wazuh import — all explicit v2 |

**Total tasks: 16** (was 13: +T0.5 auth+guard, +T5b useToast, +T12b closeCase). Estimated execution: 1-2 sesi with subagent-driven parallelism.

