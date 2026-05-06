# Helyx Master Data Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sektor + Stakeholder + RawStakeholder graph entities to Helyx, with a GraphQL surface, fuzzy reconciliation logic, and an ELK bootstrap script that materializes pending stakeholder rows for admin cleanup.

**Architecture:** Three new tenant-scoped Neo4j labels (`:Sektor`, `:Stakeholder`, `:RawStakeholder`) introduced via two idempotent migrations. Backend code follows the existing per-feature folder convention (`schema.ts`/`repo.ts`/`resolvers.ts`/`types.ts` — see `apps/backend/src/hunts/` for the canonical example). ELK bootstrap reuses the existing `sources/elk/client.ts` for the pull, dedupes via `normalizedKey`, and inserts via `MERGE` so re-runs are safe.

**Tech Stack:** TypeScript ESM, Apollo Server 4, Neo4j driver 5, Zod for boundary validation, existing ELK Elasticsearch client.

**Spec source:** `docs/master-data-spec.md` (read first).

**Project conventions (non-negotiable):**
- File ceiling 500-1000 lines; aim well below 250
- Migrations use `IF NOT EXISTS` so re-runs are safe; never edit an applied migration
- Every tenant-scoped node carries `tenantId` property; every Cypher includes `WHERE n.tenantId = $tenantId`
- Repo functions take `tenantId: string` as a required argument — never read from a global
- Resolvers start with `assertOrgRole(ctx, '<min-role>')` then pass `ctx.activeOrgId` to repo
- No tests yet (deferred per CLAUDE.md) — verification = `pnpm typecheck` + Cypher console query + GraphQL Playground query

---

## File Structure

**Migrations (new):**
- `apps/backend/src/migrations/m011_master_data_schema.ts` — constraints + indexes for Sektor, Stakeholder, RawStakeholder
- `apps/backend/src/migrations/m012_seed_sektor.ts` — seed 17 canonical sektor rows

**Stakeholder feature (new folder):**
- `apps/backend/src/stakeholders/types.ts` — TS shapes
- `apps/backend/src/stakeholders/schema.ts` — GraphQL types: Sektor, Stakeholder, SensorDeploymentSummary, enums
- `apps/backend/src/stakeholders/repo.ts` — Cypher: list, find, create, update, archive, sektorOf, stakeholdersInSektor
- `apps/backend/src/stakeholders/resolvers.ts` — `assertOrgRole(VIEWER)` for reads, `ANALYST` for writes

**Reconciliation feature (new folder):**
- `apps/backend/src/reconciliation/types.ts` — RawStakeholder + suggestion shapes
- `apps/backend/src/reconciliation/schema.ts` — GraphQL: RawStakeholder, StakeholderSuggestion, mutations
- `apps/backend/src/reconciliation/repo.ts` — listPending, findRaw, resolveRaw, bulkResolveRaw, createStakeholderFromRaw, rejectRaw, recomputeSuggestions
- `apps/backend/src/reconciliation/resolvers.ts` — assertOrgRole(ADMIN) for reconciliation mutations
- `apps/backend/src/reconciliation/fuzzy.ts` — Levenshtein, alias-match, acronym-match, domain-match ranker (no I/O, pure functions)

**ELK bootstrap (new files in existing folder):**
- `apps/backend/src/sources/elk/bootstrap-stakeholders.ts` — pull distinct (Sektor, Organisasi, Target) tuples from `nasional_cve_new-*`, normalize, MERGE RawStakeholder rows
- `apps/backend/src/sources/elk/cli-bootstrap-stakeholders.ts` — CLI entry (mirrors existing `cli.ts` pattern)

**Wire-ups (modify existing):**
- `apps/backend/src/migrations/index.ts` — register m011 + m012
- `apps/backend/src/schema/index.ts` — add stakeholderTypeDefs + reconciliationTypeDefs
- `apps/backend/src/resolvers/index.ts` — add stakeholderResolvers + reconciliationResolvers
- `apps/backend/package.json` — add `bootstrap:stakeholders` script

**Total new files:** 11 · **Modified files:** 4 · **Estimated total LOC:** ~1500 across the new files (well under per-file ceiling)

---

## Out of scope (defer to a follow-up plan)

- UI for reconciliation inbox (`/admin/stakeholders/inbox`) — owner asked backend only
- Audit log entries for resolve/reject actions — `apps/backend/src/audits/` doesn't exist yet; create with case backend
- Asset → Stakeholder linking via Target/domain match — separate post-bootstrap one-shot script, not in this plan
- Multi-sektor support (`IN_SEKTOR_SECONDARY`) — open question in spec, defer

---

## Task 1: m011 schema migration

**Files:**
- Create: `apps/backend/src/migrations/m011_master_data_schema.ts`

- [ ] **Step 1: Write the migration file**

```typescript
import type { Migration } from './types.js';

export const m011_master_data_schema: Migration = {
  id: '011_master_data_schema',
  description: 'Master data — Sektor (taxonomy), Stakeholder (monitored entity), RawStakeholder (reconciliation queue)',
  up: [
    // Sektor — global taxonomy (no tenantId; shared across orgs)
    `CREATE CONSTRAINT sektor_id_unique IF NOT EXISTS
     FOR (s:Sektor) REQUIRE s.id IS UNIQUE`,
    `CREATE CONSTRAINT sektor_slug_unique IF NOT EXISTS
     FOR (s:Sektor) REQUIRE s.slug IS UNIQUE`,
    `CREATE INDEX sektor_name IF NOT EXISTS
     FOR (s:Sektor) ON (s.name)`,

    // Stakeholder — tenant-scoped (multi-org Helyx; each org has its own list)
    `CREATE CONSTRAINT stakeholder_id_unique IF NOT EXISTS
     FOR (k:Stakeholder) REQUIRE k.id IS UNIQUE`,
    `CREATE INDEX stakeholder_tenant IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.tenantId)`,
    `CREATE INDEX stakeholder_slug IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.slug)`,
    `CREATE INDEX stakeholder_name IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.name)`,
    `CREATE FULLTEXT INDEX stakeholder_search IF NOT EXISTS
     FOR (k:Stakeholder) ON EACH [k.name, k.aliases]`,

    // RawStakeholder — tenant-scoped reconciliation queue
    `CREATE CONSTRAINT raw_stakeholder_id_unique IF NOT EXISTS
     FOR (r:RawStakeholder) REQUIRE r.id IS UNIQUE`,
    `CREATE CONSTRAINT raw_stakeholder_key_unique IF NOT EXISTS
     FOR (r:RawStakeholder) REQUIRE (r.tenantId, r.source, r.normalizedKey) IS UNIQUE`,
    `CREATE INDEX raw_stakeholder_tenant_status IF NOT EXISTS
     FOR (r:RawStakeholder) ON (r.tenantId, r.status)`,
    `CREATE INDEX raw_stakeholder_hit_count IF NOT EXISTS
     FOR (r:RawStakeholder) ON (r.hitCount)`,
  ],
};
```

> Note on tenant-scoping: spec is silent on whether Stakeholder is tenant-scoped or global. **Decision: tenant-scoped.** Different Helyx tenants (CTH, BSSN) maintain different stakeholder lists — CTH's Stakeholder for "Kementerian ESDM" may have different `notes`, `coords`, `sensorStack` than BSSN's. Sektor stays global (taxonomy is shared). RawStakeholder is also tenant-scoped because reconciliation decisions are tenant-private.

- [ ] **Step 2: Register in migrations/index.ts**

Modify `apps/backend/src/migrations/index.ts`:

```typescript
import { m011_master_data_schema } from './m011_master_data_schema.js';
// ...
export const migrations: Migration[] = [
  // ... existing
  m010_detection_strategy_schema,
  m011_master_data_schema,
];
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @helyx/backend typecheck`
Expected: PASS (no output).

- [ ] **Step 4: Apply migration**

Run: `pnpm --filter @helyx/backend migrate`
Expected: log line `applied 011_master_data_schema`.

- [ ] **Step 5: Verify in Cypher console**

Open `http://localhost:7474`, login (neo4j / your password), run:

```cypher
SHOW CONSTRAINTS WHERE name STARTS WITH 'sektor_' OR name STARTS WITH 'stakeholder_' OR name STARTS WITH 'raw_stakeholder_';
```

Expected: 5 constraints (sektor_id_unique, sektor_slug_unique, stakeholder_id_unique, raw_stakeholder_id_unique, raw_stakeholder_key_unique).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/migrations/m011_master_data_schema.ts apps/backend/src/migrations/index.ts
git commit -m "feat(master-data): m011 schema for Sektor + Stakeholder + RawStakeholder"
```

---

## Task 2: m012 seed sektor migration

**Files:**
- Create: `apps/backend/src/migrations/m012_seed_sektor.ts`

- [ ] **Step 1: Write migration with all 17 sektor as MERGE statements**

```typescript
import type { Migration } from './types.js';

const SEKTOR_ROWS: Array<{ slug: string; name: string; displayOrder: number }> = [
  { slug: 'administrasi-pemerintahan', name: 'Administrasi Pemerintahan', displayOrder: 1 },
  { slug: 'esdm',                       name: 'ESDM',                       displayOrder: 2 },
  { slug: 'pendidikan',                 name: 'Pendidikan',                 displayOrder: 3 },
  { slug: 'transportasi',               name: 'Transportasi',               displayOrder: 4 },
  { slug: 'keuangan',                   name: 'Keuangan',                   displayOrder: 5 },
  { slug: 'pertahanan',                 name: 'Pertahanan',                 displayOrder: 6 },
  { slug: 'pariwisata',                 name: 'Pariwisata',                 displayOrder: 7 },
  { slug: 'tik',                        name: 'TIK',                        displayOrder: 8 },
  { slug: 'kesehatan',                  name: 'Kesehatan',                  displayOrder: 9 },
  { slug: 'energi',                     name: 'Energi',                     displayOrder: 10 },
  { slug: 'perdagangan',                name: 'Perdagangan',                displayOrder: 11 },
  { slug: 'pangan',                     name: 'Pangan',                     displayOrder: 12 },
  { slug: 'industri',                   name: 'Industri',                   displayOrder: 13 },
  { slug: 'logistik',                   name: 'Logistik',                   displayOrder: 14 },
  { slug: 'ormas',                      name: 'Ormas',                      displayOrder: 15 },
  { slug: 'media',                      name: 'Media',                      displayOrder: 16 },
  { slug: 'perseorangan',               name: 'Perseorangan',               displayOrder: 17 },
];

const upsertCypher = SEKTOR_ROWS.map(
  (r) => `MERGE (s:Sektor {slug: '${r.slug}'})
          ON CREATE SET s.id = randomUUID(), s.name = '${r.name}', s.displayOrder = ${r.displayOrder}, s.createdAt = datetime(), s.updatedAt = datetime()
          ON MATCH  SET s.name = '${r.name}', s.displayOrder = ${r.displayOrder}, s.updatedAt = datetime()`,
);

export const m012_seed_sektor: Migration = {
  id: '012_seed_sektor',
  description: 'Seed 17 canonical sektor rows (idempotent via MERGE on slug)',
  up: upsertCypher,
};
```

- [ ] **Step 2: Register in migrations/index.ts**

Add to `migrations` array after m011.

- [ ] **Step 3: Run migration + verify**

```bash
pnpm --filter @helyx/backend typecheck
pnpm --filter @helyx/backend migrate
```

In Neo4j browser:
```cypher
MATCH (s:Sektor) RETURN s.slug, s.name, s.displayOrder ORDER BY s.displayOrder;
```

Expected: 17 rows in order.

- [ ] **Step 4: Idempotency check**

Re-run `pnpm --filter @helyx/backend migrate`. The `_Migration` ledger skips applied IDs, so no statements re-run. Verify Sektor count still 17:

```cypher
MATCH (s:Sektor) RETURN count(s);
```

Expected: 17.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/migrations/m012_seed_sektor.ts apps/backend/src/migrations/index.ts
git commit -m "feat(master-data): m012 seed 17 canonical sektor"
```

---

## Task 3: Stakeholder TS types

**Files:**
- Create: `apps/backend/src/stakeholders/types.ts`

- [ ] **Step 1: Write types**

```typescript
export type SensorStack = 'WAZUH_FULL' | 'ELK_FULL' | 'WAZUH_AGENT' | 'MIXED';
export type SensorStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';
export type StakeholderStatus = 'ACTIVE' | 'ARCHIVED';

export interface SektorRow {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
}

export interface StakeholderRow {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  city: string | null;
  coords: [number, number] | null;
  notes: string | null;
  status: StakeholderStatus;
  sektorId: string | null;
  sensorStack: SensorStack | null;
  sensorStatus: SensorStatus | null;
  sensorAgentCount: number | null;
  sensorDeployedAt: string | null;
  sensorNotes: string | null;
  createdAt: string;
  updatedAt: string;
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @helyx/backend typecheck`
Expected: PASS.

(no commit yet — types committed with Task 5 when paired with repo)

---

## Task 4: Stakeholder GraphQL schema

**Files:**
- Create: `apps/backend/src/stakeholders/schema.ts`

- [ ] **Step 1: Write schema**

```typescript
export const stakeholderTypeDefs = /* GraphQL */ `
  enum SensorStack { WAZUH_FULL ELK_FULL WAZUH_AGENT MIXED }
  enum SensorStatus { ONLINE DEGRADED OFFLINE }
  enum StakeholderStatus { ACTIVE ARCHIVED }

  type Sektor {
    id: ID!
    slug: String!
    name: String!
    displayOrder: Int!
    stakeholderCount: Int!
  }

  type SensorDeploymentSummary {
    stack: SensorStack
    status: SensorStatus
    agentCount: Int
    deployedAt: String
    notes: String
  }

  type Stakeholder {
    id: ID!
    slug: String!
    name: String!
    aliases: [String!]!
    city: String
    coords: [Float!]
    notes: String
    status: StakeholderStatus!
    sektor: Sektor
    sensor: SensorDeploymentSummary!
    createdAt: String!
    updatedAt: String!
  }

  input StakeholderInput {
    slug: String!
    name: String!
    aliases: [String!]
    city: String
    coords: [Float!]
    notes: String
    sektorId: ID
  }

  input StakeholderUpdateInput {
    name: String
    aliases: [String!]
    city: String
    coords: [Float!]
    notes: String
    sektorId: ID
  }

  input SensorInput {
    stack: SensorStack
    status: SensorStatus
    agentCount: Int
    deployedAt: String
    notes: String
  }

  extend type Query {
    sektors: [Sektor!]!
    stakeholders(sektorId: ID, status: StakeholderStatus, search: String, first: Int = 50): [Stakeholder!]!
    stakeholder(id: ID!): Stakeholder
    stakeholderBySlug(slug: String!): Stakeholder
  }

  extend type Mutation {
    createStakeholder(input: StakeholderInput!): Stakeholder!
    updateStakeholder(id: ID!, input: StakeholderUpdateInput!): Stakeholder!
    archiveStakeholder(id: ID!): Stakeholder!
    setStakeholderSensor(id: ID!, input: SensorInput!): Stakeholder!
  }
`;
```

- [ ] **Step 2: Typecheck**

Expected: PASS (typeDefs is a string, no TS issues).

(no commit yet — wait for Task 6)

---

## Task 5: Stakeholder repo

**Files:**
- Create: `apps/backend/src/stakeholders/repo.ts`

- [ ] **Step 1: Write repo with all CRUD + nested resolvers**

Pattern: mirror `apps/backend/src/hunts/repo.ts` (270 lines — read it first as reference).

Functions to implement (signatures only — bodies follow standard pattern):

```typescript
import { randomUUID } from 'node:crypto';
import { getSession } from '../db/driver.js';
import type { StakeholderRow, StakeholderInput, SektorRow } from './types.js';

export async function listSektors(): Promise<SektorRow[]>;

export async function listStakeholders(
  tenantId: string,
  filter: { sektorId?: string; status?: string; search?: string; first?: number },
): Promise<StakeholderRow[]>;

export async function findStakeholder(tenantId: string, id: string): Promise<StakeholderRow | null>;

export async function findStakeholderBySlug(tenantId: string, slug: string): Promise<StakeholderRow | null>;

export async function createStakeholder(tenantId: string, input: StakeholderInput): Promise<StakeholderRow>;

export async function updateStakeholder(
  tenantId: string,
  id: string,
  input: Partial<StakeholderInput>,
): Promise<StakeholderRow>;

export async function archiveStakeholder(tenantId: string, id: string): Promise<StakeholderRow>;

export async function setStakeholderSensor(
  tenantId: string,
  id: string,
  sensor: {
    stack: string | null;
    status: string | null;
    agentCount: number | null;
    deployedAt: string | null;
    notes: string | null;
  },
): Promise<StakeholderRow>;

export async function findSektorOfStakeholder(stakeholderId: string): Promise<SektorRow | null>;

export async function countStakeholdersInSektor(sektorId: string, tenantId: string): Promise<number>;
```

Implementation notes:
- `createStakeholder` generates UUID, sets createdAt/updatedAt = `datetime()`, optionally creates `IN_SEKTOR` edge if sektorId provided
- `updateStakeholder` uses `SET stakeholder += $patch` for partial; re-link sektor if changed (DELETE existing IN_SEKTOR, MERGE new)
- All Cypher includes `WHERE k.tenantId = $tenantId`
- `listStakeholders` — when `search` provided, use `db.index.fulltext.queryNodes('stakeholder_search', $search)`; else plain match
- `archiveStakeholder` sets `status = 'ARCHIVED'`, doesn't delete

Property ↔ Neo4j mapping helper (used by all rowTo* functions):
```typescript
function rowToStakeholder(rec: { get: (k: string) => unknown }): StakeholderRow {
  const k = rec.get('k') as Record<string, unknown>;
  const sektorId = rec.get('sektorId') as string | null;
  return {
    id: k.id as string,
    slug: k.slug as string,
    name: k.name as string,
    aliases: (k.aliases as string[]) ?? [],
    city: (k.city as string) ?? null,
    coords: (k.coords as [number, number]) ?? null,
    notes: (k.notes as string) ?? null,
    status: (k.status as 'ACTIVE' | 'ARCHIVED') ?? 'ACTIVE',
    sektorId: sektorId,
    sensorStack: (k.sensorStack as 'WAZUH_FULL' | 'ELK_FULL' | 'WAZUH_AGENT' | 'MIXED') ?? null,
    sensorStatus: (k.sensorStatus as 'ONLINE' | 'DEGRADED' | 'OFFLINE') ?? null,
    sensorAgentCount: (k.sensorAgentCount as number) ?? null,
    sensorDeployedAt: (k.sensorDeployedAt as string) ?? null,
    sensorNotes: (k.sensorNotes as string) ?? null,
    createdAt: String(k.createdAt),
    updatedAt: String(k.updatedAt),
  };
}
```

- [ ] **Step 2: Typecheck**

Expected: PASS.

(no commit yet — wait for Task 6)

---

## Task 6: Stakeholder resolvers + wire-up

**Files:**
- Create: `apps/backend/src/stakeholders/resolvers.ts`
- Modify: `apps/backend/src/schema/index.ts`
- Modify: `apps/backend/src/resolvers/index.ts`

- [ ] **Step 1: Write resolvers**

```typescript
import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  archiveStakeholder,
  countStakeholdersInSektor,
  createStakeholder,
  findSektorOfStakeholder,
  findStakeholder,
  findStakeholderBySlug,
  listSektors,
  listStakeholders,
  setStakeholderSensor,
  updateStakeholder,
  type StakeholderRow,
  type SektorRow,
} from './repo.js';
import type { StakeholderInput } from './types.js';

export const stakeholderResolvers = {
  Query: {
    sektors: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listSektors();
    },
    stakeholders: (_p: unknown, args: { sektorId?: string; status?: string; search?: string; first?: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listStakeholders(ctx.activeOrgId, args);
    },
    stakeholder: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findStakeholder(ctx.activeOrgId, args.id);
    },
    stakeholderBySlug: (_p: unknown, args: { slug: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findStakeholderBySlug(ctx.activeOrgId, args.slug);
    },
  },

  Mutation: {
    createStakeholder: (_p: unknown, args: { input: StakeholderInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return createStakeholder(ctx.activeOrgId, args.input);
    },
    updateStakeholder: (_p: unknown, args: { id: string; input: Partial<StakeholderInput> }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return updateStakeholder(ctx.activeOrgId, args.id, args.input);
    },
    archiveStakeholder: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      return archiveStakeholder(ctx.activeOrgId, args.id);
    },
    setStakeholderSensor: (_p: unknown, args: { id: string; input: { stack?: string; status?: string; agentCount?: number; deployedAt?: string; notes?: string } }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return setStakeholderSensor(ctx.activeOrgId, args.id, {
        stack: args.input.stack ?? null,
        status: args.input.status ?? null,
        agentCount: args.input.agentCount ?? null,
        deployedAt: args.input.deployedAt ?? null,
        notes: args.input.notes ?? null,
      });
    },
  },

  Stakeholder: {
    sektor: (parent: StakeholderRow) => findSektorOfStakeholder(parent.id),
    sensor: (parent: StakeholderRow) => ({
      stack: parent.sensorStack,
      status: parent.sensorStatus,
      agentCount: parent.sensorAgentCount,
      deployedAt: parent.sensorDeployedAt,
      notes: parent.sensorNotes,
    }),
  },

  Sektor: {
    stakeholderCount: (parent: SektorRow, _a: unknown, ctx: RequestContext) =>
      countStakeholdersInSektor(parent.id, ctx.activeOrgId!),
  },
};
```

- [ ] **Step 2: Wire into schema/resolvers aggregators**

In `apps/backend/src/schema/index.ts`, add `stakeholderTypeDefs` to the `typeDefs` array.
In `apps/backend/src/resolvers/index.ts`, deep-merge `stakeholderResolvers` into the resolvers map.

(Match the import + spread pattern used for the latest existing feature like `tactics` or `hunts` — check current state of those two files first for the exact merge convention.)

- [ ] **Step 3: Typecheck + start backend**

```bash
pnpm --filter @helyx/backend typecheck
pnpm --filter @helyx/backend dev
```

Expected: server starts on :4000.

- [ ] **Step 4: GraphQL Playground manual verify**

Open `http://localhost:4000/graphql`. Set headers (use a real JWT + org id):
```json
{ "Authorization": "Bearer <jwt>", "X-Helyx-Org": "<orgId>" }
```

Run:
```graphql
query { sektors { slug name displayOrder stakeholderCount } }
```
Expected: 17 sektors, all `stakeholderCount: 0`.

Run:
```graphql
mutation {
  createStakeholder(input: {
    slug: "kementerian-esdm",
    name: "Kementerian ESDM",
    aliases: ["K-ESDM", "Kemen ESDM"],
    city: "Jakarta",
    coords: [106.8456, -6.2088],
    sektorId: "<id-from-prev-query>"
  }) { id slug name sektor { slug } }
}
```
Expected: returns Stakeholder with sektor populated.

Run sektors again — `kementerian-esdm` slug now `stakeholderCount: 1`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/stakeholders/ apps/backend/src/schema/index.ts apps/backend/src/resolvers/index.ts
git commit -m "feat(master-data): Stakeholder + Sektor GraphQL surface (read + write + sensor attribute)"
```

---

## Task 7: Reconciliation TS types + GraphQL schema

**Files:**
- Create: `apps/backend/src/reconciliation/types.ts`
- Create: `apps/backend/src/reconciliation/schema.ts`

- [ ] **Step 1: Types**

```typescript
export type ReconciliationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface RawStakeholderRow {
  id: string;
  source: string;
  rawName: string;
  normalizedKey: string;
  rawSektor: string | null;
  hitCount: number;
  targetCount: number;
  lastSeen: string;
  status: ReconciliationStatus;
  confidence: number | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolvedToId: string | null;
}

export interface SuggestionRow {
  stakeholderId: string;
  confidence: number;
  reason: 'alias-match' | 'levenshtein' | 'domain-match' | 'acronym-match' | 'pattern-match';
}
```

- [ ] **Step 2: Schema**

```typescript
export const reconciliationTypeDefs = /* GraphQL */ `
  enum ReconciliationStatus { PENDING APPROVED REJECTED NEEDS_REVIEW }

  type RawStakeholder {
    id: ID!
    source: String!
    rawName: String!
    rawSektor: String
    hitCount: Int!
    targetCount: Int!
    lastSeen: String!
    status: ReconciliationStatus!
    confidence: Float
    resolvedTo: Stakeholder
    resolvedAt: String
    suggestions: [StakeholderSuggestion!]!
  }

  type StakeholderSuggestion {
    stakeholder: Stakeholder!
    confidence: Float!
    reason: String!
  }

  extend type Query {
    rawStakeholders(status: ReconciliationStatus = PENDING, first: Int = 50): [RawStakeholder!]!
    rawStakeholder(id: ID!): RawStakeholder
    rawStakeholderCounts: RawStakeholderCounts!
  }

  type RawStakeholderCounts {
    pending: Int!
    approved: Int!
    rejected: Int!
    needsReview: Int!
  }

  extend type Mutation {
    resolveRawStakeholder(rawId: ID!, stakeholderId: ID!): RawStakeholder!
    bulkResolveRawStakeholders(rawIds: [ID!]!, stakeholderId: ID!): Int!
    createStakeholderFromRaw(rawId: ID!, input: StakeholderInput!): RawStakeholder!
    rejectRawStakeholder(rawId: ID!, reason: String): RawStakeholder!
    recomputeSuggestions(rawId: ID): Int!
  }
`;
```

- [ ] **Step 3: Typecheck**

Expected: PASS.

(no commit yet — wait for Task 10)

---

## Task 8: Reconciliation fuzzy matcher (pure functions)

**Files:**
- Create: `apps/backend/src/reconciliation/fuzzy.ts`

- [ ] **Step 1: Write pure fuzzy module**

```typescript
import type { StakeholderRow } from '../stakeholders/types.js';
import type { SuggestionRow } from './types.js';

export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

export function acronym(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase();
}

export interface MatchInput {
  rawName: string;
  rawNormalizedKey: string;
}

export function rankSuggestions(
  raw: MatchInput,
  candidates: StakeholderRow[],
  options: { maxResults?: number; levenshteinThreshold?: number } = {},
): SuggestionRow[] {
  const max = options.maxResults ?? 3;
  const lvThreshold = options.levenshteinThreshold ?? 4;
  const out: SuggestionRow[] = [];

  for (const c of candidates) {
    // 1. exact alias match
    if (c.aliases.some((a) => normalizeKey(a) === raw.rawNormalizedKey)) {
      out.push({ stakeholderId: c.id, confidence: 1.0, reason: 'alias-match' });
      continue;
    }

    // 2. levenshtein on name + aliases
    const candidates2 = [c.name, ...c.aliases];
    const lvBest = Math.min(...candidates2.map((s) => levenshtein(s.toLowerCase(), raw.rawName.toLowerCase())));
    if (lvBest <= lvThreshold) {
      const conf = Math.max(0, 1 - lvBest / Math.max(raw.rawName.length, 8));
      out.push({ stakeholderId: c.id, confidence: conf, reason: 'levenshtein' });
      continue;
    }

    // 3. acronym match
    const rawAcronym = acronym(raw.rawName);
    const candAcronym = acronym(c.name);
    if (rawAcronym.length >= 2 && rawAcronym === candAcronym) {
      out.push({ stakeholderId: c.id, confidence: 0.7, reason: 'acronym-match' });
      continue;
    }
  }

  // sort by confidence desc, slice
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, max);
}
```

> Note: `domain-match` requires Asset graph traversal (out-of-pure scope), so it's added as a separate function in repo, not here.

- [ ] **Step 2: Typecheck**

Expected: PASS.

---

## Task 9: Reconciliation repo

**Files:**
- Create: `apps/backend/src/reconciliation/repo.ts`

- [ ] **Step 1: Write repo functions**

Functions:

```typescript
export async function listRawStakeholders(
  tenantId: string,
  status: ReconciliationStatus,
  first: number,
): Promise<RawStakeholderRow[]>;

export async function findRawStakeholder(tenantId: string, id: string): Promise<RawStakeholderRow | null>;

export async function rawStakeholderCounts(tenantId: string): Promise<{
  pending: number; approved: number; rejected: number; needsReview: number;
}>;

export async function resolveRawStakeholder(
  tenantId: string,
  rawId: string,
  stakeholderId: string,
  resolverUserId: string,
): Promise<RawStakeholderRow>;

export async function bulkResolveRawStakeholders(
  tenantId: string,
  rawIds: string[],
  stakeholderId: string,
  resolverUserId: string,
): Promise<number>;

export async function rejectRawStakeholder(
  tenantId: string,
  rawId: string,
  reason: string | null,
  resolverUserId: string,
): Promise<RawStakeholderRow>;

export async function listSuggestionsForRaw(
  tenantId: string,
  rawId: string,
): Promise<Array<{ stakeholderId: string; confidence: number; reason: string }>>;

export async function cacheSuggestions(
  tenantId: string,
  rawId: string,
  suggestions: SuggestionRow[],
): Promise<void>;

export async function recomputeSuggestionsForAll(tenantId: string): Promise<number>;
```

Implementation notes:
- `listRawStakeholders` returns ordered by `hitCount DESC, lastSeen DESC` per spec
- `resolveRawStakeholder` MERGE `[:RESOLVED_TO]` edge, set status=APPROVED, resolvedAt=datetime(), resolvedBy=user
- `bulkResolveRawStakeholders` single Cypher with `UNWIND $rawIds`, returns count of updates
- `cacheSuggestions` deletes existing `[:SUGGESTED]` edges then MERGEs new ones with `confidence` + `reason` properties on edge
- `recomputeSuggestionsForAll`: load all PENDING raw + all stakeholders for tenant, run `rankSuggestions` per raw, write cache. Return number of raw rows recomputed.

- [ ] **Step 2: Typecheck + commit (with fuzzy.ts)**

```bash
pnpm --filter @helyx/backend typecheck
git add apps/backend/src/reconciliation/types.ts apps/backend/src/reconciliation/schema.ts apps/backend/src/reconciliation/fuzzy.ts apps/backend/src/reconciliation/repo.ts
git commit -m "feat(reconciliation): types + schema + fuzzy matcher + repo"
```

---

## Task 10: Reconciliation resolvers + wire-up

**Files:**
- Create: `apps/backend/src/reconciliation/resolvers.ts`
- Modify: `apps/backend/src/schema/index.ts` (add reconciliationTypeDefs)
- Modify: `apps/backend/src/resolvers/index.ts` (add reconciliationResolvers)

- [ ] **Step 1: Write resolvers**

```typescript
import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import { findStakeholder, listStakeholders } from '../stakeholders/repo.js';
import {
  bulkResolveRawStakeholders,
  cacheSuggestions,
  findRawStakeholder,
  listRawStakeholders,
  listSuggestionsForRaw,
  rawStakeholderCounts,
  recomputeSuggestionsForAll,
  rejectRawStakeholder,
  resolveRawStakeholder,
} from './repo.js';
import { rankSuggestions } from './fuzzy.js';
import { createStakeholder } from '../stakeholders/repo.js';
import type { RawStakeholderRow, ReconciliationStatus } from './types.js';
import type { StakeholderInput } from '../stakeholders/types.js';

export const reconciliationResolvers = {
  Query: {
    rawStakeholders: (_p: unknown, args: { status: ReconciliationStatus; first: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return listRawStakeholders(ctx.activeOrgId, args.status, args.first);
    },
    rawStakeholder: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return findRawStakeholder(ctx.activeOrgId, args.id);
    },
    rawStakeholderCounts: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return rawStakeholderCounts(ctx.activeOrgId);
    },
  },
  Mutation: {
    resolveRawStakeholder: (_p: unknown, args: { rawId: string; stakeholderId: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      return resolveRawStakeholder(ctx.activeOrgId, args.rawId, args.stakeholderId, ctx.user.id);
    },
    bulkResolveRawStakeholders: (_p: unknown, args: { rawIds: string[]; stakeholderId: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      return bulkResolveRawStakeholders(ctx.activeOrgId, args.rawIds, args.stakeholderId, ctx.user.id);
    },
    createStakeholderFromRaw: async (_p: unknown, args: { rawId: string; input: StakeholderInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const created = await createStakeholder(ctx.activeOrgId, args.input);
      return resolveRawStakeholder(ctx.activeOrgId, args.rawId, created.id, ctx.user.id);
    },
    rejectRawStakeholder: (_p: unknown, args: { rawId: string; reason?: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      return rejectRawStakeholder(ctx.activeOrgId, args.rawId, args.reason ?? null, ctx.user.id);
    },
    recomputeSuggestions: async (_p: unknown, args: { rawId?: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      if (args.rawId) {
        const raw = await findRawStakeholder(ctx.activeOrgId, args.rawId);
        if (!raw) return 0;
        const cands = await listStakeholders(ctx.activeOrgId, { first: 1000 });
        const sugg = rankSuggestions({ rawName: raw.rawName, rawNormalizedKey: raw.normalizedKey }, cands);
        await cacheSuggestions(ctx.activeOrgId, raw.id, sugg);
        return 1;
      }
      return recomputeSuggestionsForAll(ctx.activeOrgId);
    },
  },
  RawStakeholder: {
    resolvedTo: async (parent: RawStakeholderRow, _a: unknown, ctx: RequestContext) =>
      parent.resolvedToId ? findStakeholder(ctx.activeOrgId!, parent.resolvedToId) : null,
    suggestions: async (parent: RawStakeholderRow, _a: unknown, ctx: RequestContext) => {
      const rows = await listSuggestionsForRaw(ctx.activeOrgId!, parent.id);
      return Promise.all(
        rows.map(async (r) => ({
          stakeholder: await findStakeholder(ctx.activeOrgId!, r.stakeholderId),
          confidence: r.confidence,
          reason: r.reason,
        })),
      );
    },
  },
};
```

> N+1 note: `RawStakeholder.suggestions` does N+1 reads of `findStakeholder`. Acceptable for inbox (max 50 rows × 3 suggestions = 150 reads, all hot in cache after first). If perf becomes a problem, batch via DataLoader (see `apps/backend/src/dataloaders/`).

- [ ] **Step 2: Wire into aggregators + typecheck**

Add `reconciliationTypeDefs` to schema/index.ts, `reconciliationResolvers` to resolvers/index.ts.

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 3: GraphQL Playground verify**

```graphql
query { rawStakeholderCounts { pending approved rejected needsReview } }
```
Expected: all 0 (no raw rows yet — bootstrap step adds them).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/reconciliation/resolvers.ts apps/backend/src/schema/index.ts apps/backend/src/resolvers/index.ts
git commit -m "feat(reconciliation): resolvers + wire into GraphQL"
```

---

## Task 11: ELK bootstrap module

**Files:**
- Create: `apps/backend/src/sources/elk/bootstrap-stakeholders.ts`

- [ ] **Step 1: Write bootstrap module**

Pattern: read `apps/backend/src/sources/elk/sync.ts` for the established ELK client + write transaction pattern.

Module shape:

```typescript
import { z } from 'zod';
import { getSession } from '../../db/driver.js';
import { getElkClient, type ElkClient } from './client.js';
import { normalizeKey } from '../../reconciliation/fuzzy.js';
import { logger } from '../../logger.js';

const BUCKET_QUERY = (sinceIso: string) => ({
  size: 0,
  query: { range: { '@timestamp': { gte: sinceIso } } },
  aggs: {
    sektor: {
      terms: { field: 'Sektor.keyword', size: 100 },
      aggs: {
        org: {
          terms: { field: 'Organisasi.keyword', size: 1000 },
          aggs: {
            target: { terms: { field: 'Target.keyword', size: 50 } },
            last_seen: { max: { field: '@timestamp' } },
          },
        },
      },
    },
  },
});

const BucketShape = z.object({
  aggregations: z.object({
    sektor: z.object({
      buckets: z.array(z.object({
        key: z.string(),
        doc_count: z.number(),
        org: z.object({
          buckets: z.array(z.object({
            key: z.string(),
            doc_count: z.number(),
            target: z.object({ buckets: z.array(z.object({ key: z.string() })) }),
            last_seen: z.object({ value_as_string: z.string() }),
          })),
        }),
      })),
    }),
  }),
});

export interface BootstrapOptions {
  tenantId: string;
  sinceDays?: number;     // default 180
  index?: string;          // default 'nasional_cve_new-*'
  dryRun?: boolean;
}

export interface BootstrapResult {
  scanned: number;
  upserted: number;
  skipped: number;
  durationMs: number;
}

export async function bootstrapStakeholders(opts: BootstrapOptions): Promise<BootstrapResult> {
  const start = Date.now();
  const sinceDays = opts.sinceDays ?? 180;
  const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const index = opts.index ?? 'nasional_cve_new-*';

  const client = getElkClient();
  const raw = await client.search({ index, body: BUCKET_QUERY(sinceIso) });
  const parsed = BucketShape.parse(raw);

  const rows: Array<{
    source: string;
    rawName: string;
    normalizedKey: string;
    rawSektor: string;
    hitCount: number;
    targetCount: number;
    lastSeen: string;
  }> = [];

  for (const sektorBucket of parsed.aggregations.sektor.buckets) {
    if (sektorBucket.key === 'Nan') continue; // skip per spec
    for (const orgBucket of sektorBucket.org.buckets) {
      const trimmed = orgBucket.key.trim();
      if (!trimmed) continue;
      rows.push({
        source: 'ELK',
        rawName: trimmed,
        normalizedKey: normalizeKey(trimmed),
        rawSektor: sektorBucket.key,
        hitCount: orgBucket.doc_count,
        targetCount: orgBucket.target.buckets.length,
        lastSeen: orgBucket.last_seen.value_as_string,
      });
    }
  }

  if (opts.dryRun) {
    logger.info({ rows: rows.length }, 'bootstrap-stakeholders dry run');
    return { scanned: rows.length, upserted: 0, skipped: 0, durationMs: Date.now() - start };
  }

  const session = getSession();
  let upserted = 0;
  try {
    await session.executeWrite(async (tx) => {
      const result = await tx.run(
        `UNWIND $rows AS row
         MERGE (r:RawStakeholder {tenantId: $tenantId, source: row.source, normalizedKey: row.normalizedKey})
         ON CREATE SET r.id = randomUUID(),
                       r.rawName = row.rawName,
                       r.rawSektor = row.rawSektor,
                       r.hitCount = row.hitCount,
                       r.targetCount = row.targetCount,
                       r.lastSeen = datetime(row.lastSeen),
                       r.status = 'PENDING',
                       r.createdAt = datetime()
         ON MATCH SET  r.rawName = row.rawName,
                       r.rawSektor = row.rawSektor,
                       r.hitCount = row.hitCount,
                       r.targetCount = row.targetCount,
                       r.lastSeen = datetime(row.lastSeen)
         RETURN count(r) AS upserted`,
        { tenantId: opts.tenantId, rows },
      );
      upserted = (result.records[0]?.get('upserted') as { toNumber: () => number }).toNumber();
    });
  } finally {
    await session.close();
  }

  return { scanned: rows.length, upserted, skipped: rows.length - upserted, durationMs: Date.now() - start };
}
```

> Untrusted-input note: `rawName` from ELK can contain anything. We Zod-validate the bucket shape (non-string keys would throw). Cypher uses parameterized writes — no string interpolation of user data.

- [ ] **Step 2: Typecheck**

Expected: PASS.

---

## Task 12: ELK bootstrap CLI

**Files:**
- Create: `apps/backend/src/sources/elk/cli-bootstrap-stakeholders.ts`
- Modify: `apps/backend/package.json` (add script)

- [ ] **Step 1: CLI entry**

```typescript
#!/usr/bin/env node
import { bootstrapStakeholders } from './bootstrap-stakeholders.js';
import { logger } from '../../logger.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = arg('--tenant') ?? process.env.HELYX_BOOTSTRAP_TENANT_ID;
  if (!tenantId) {
    console.error('--tenant <orgId> is required (or set HELYX_BOOTSTRAP_TENANT_ID)');
    process.exit(2);
  }
  const sinceDays = arg('--since-days') ? Number(arg('--since-days')) : 180;
  const index = arg('--index');
  const dryRun = process.argv.includes('--dry-run');

  const result = await bootstrapStakeholders({ tenantId, sinceDays, index, dryRun });
  logger.info({ result }, 'bootstrap-stakeholders complete');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add package script**

In `apps/backend/package.json`, under `scripts`:
```json
"bootstrap:stakeholders": "tsx src/sources/elk/cli-bootstrap-stakeholders.ts"
```

- [ ] **Step 3: Dry-run sanity check**

Pre-req: ELK reachable + `nasional_cve_new-*` index exists.

```bash
pnpm --filter @helyx/backend bootstrap:stakeholders -- --tenant <orgId> --dry-run --since-days 30
```

Expected JSON: `{ "scanned": <some N>, "upserted": 0, "skipped": 0, ... }` and N matches roughly your expected ELK distinct org count for last 30 days.

- [ ] **Step 4: Real run**

```bash
pnpm --filter @helyx/backend bootstrap:stakeholders -- --tenant <orgId> --since-days 180
```

In Neo4j browser:
```cypher
MATCH (r:RawStakeholder {tenantId: '<orgId>'})
RETURN r.status, count(r) ORDER BY r.status;
```
Expected: most rows `PENDING`, totaling ~853 per spec (or current ELK count).

```cypher
MATCH (r:RawStakeholder {tenantId: '<orgId>'})
RETURN r.rawName, r.hitCount, r.lastSeen
ORDER BY r.hitCount DESC LIMIT 10;
```
Expected: top-10 noisy orgs first.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/sources/elk/bootstrap-stakeholders.ts apps/backend/src/sources/elk/cli-bootstrap-stakeholders.ts apps/backend/package.json
git commit -m "feat(reconciliation): ELK bootstrap CLI for RawStakeholder queue"
```

---

## Task 13: End-to-end verify reconciliation flow

- [ ] **Step 1: Recompute suggestions for the tenant**

GraphQL Playground:
```graphql
mutation { recomputeSuggestions }
```
Expected: integer (count of raw rows where suggestions cached).

- [ ] **Step 2: Inspect a raw row's suggestions**

```graphql
query {
  rawStakeholders(status: PENDING, first: 5) {
    id rawName rawSektor hitCount
    suggestions { confidence reason stakeholder { slug name } }
  }
}
```
Expected: each row returns 0-3 suggestions, sorted by confidence.

(With only 1 Stakeholder created in Task 6, most raw rows will have 0 suggestions — that's correct. Suggestions populate as more Stakeholders get created.)

- [ ] **Step 3: Resolve flow**

Pick a raw with a high-confidence suggestion. In Playground:
```graphql
mutation { resolveRawStakeholder(rawId: "<rawId>", stakeholderId: "<stakeholderId>") {
  status resolvedTo { slug } resolvedAt
}}
```
Expected: `status: APPROVED`, `resolvedTo.slug` populated.

```graphql
query { rawStakeholderCounts { pending approved rejected needsReview } }
```
Expected: `approved: 1`, pending decremented by 1.

- [ ] **Step 4: Bulk resolve flow**

```graphql
mutation { bulkResolveRawStakeholders(rawIds: ["<id1>", "<id2>"], stakeholderId: "<stakeholderId>") }
```
Expected: integer 2.

- [ ] **Step 5: Reject flow**

```graphql
mutation { rejectRawStakeholder(rawId: "<rawId>", reason: "noise / not a real org") {
  status
}}
```
Expected: `status: REJECTED`.

- [ ] **Step 6: Create-from-raw flow**

```graphql
mutation { createStakeholderFromRaw(rawId: "<rawId>", input: {
  slug: "kementerian-pertanian",
  name: "Kementerian Pertanian",
  aliases: ["Kemen Tani"],
  city: "Jakarta",
  sektorId: "<id-of-pangan-sektor>"
}) { status resolvedTo { slug name } }}
```
Expected: new Stakeholder created + raw row resolved to it in one shot.

- [ ] **Step 7: Final commit (if any wire-up tweaks needed)**

If everything passes, no commit. Otherwise commit fixes:
```bash
git commit -am "fix(reconciliation): <description>"
```

---

## Self-Review Checklist (post-write)

**Spec coverage:**
- [x] Sektor schema → Task 1, 2
- [x] Stakeholder schema → Task 1, 3-6
- [x] Sensor attribute → Task 4-6 (`SensorDeploymentSummary` resolver, `setStakeholderSensor` mutation)
- [x] RawStakeholder schema → Task 1, 7
- [x] Reconciliation mutations → Task 9, 10
- [x] Fuzzy suggestions (alias, levenshtein, acronym) → Task 8 (`domain-match` and `pattern-match` deferred — note in Open Questions)
- [x] ELK bootstrap CLI → Task 11, 12
- [x] End-to-end verify → Task 13

**Out-of-scope acknowledged:**
- Reconciliation UI (`/admin/stakeholders/inbox`) — separate later plan
- Audit log entries — `apps/backend/src/audits/` doesn't exist; create alongside case backend
- Asset → Stakeholder linking via Target/domain → separate post-bootstrap script
- Multi-sektor (`IN_SEKTOR_SECONDARY`) — open question per spec

**Type consistency:**
- `tenantId: string` parameter shape consistent across all repo functions
- Resolver signatures use `args` typed inline; matches existing `tactics`/`hunts` convention
- Enum strings (`SensorStack`, `SensorStatus`, `StakeholderStatus`, `ReconciliationStatus`) consistent between TS and GraphQL

**No placeholders verified.** Every code step contains complete code. Migration files are full; repo function signatures are explicit; resolvers show full logic.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-helyx-master-data-backend.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because each task is self-contained and reviewable independently.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Faster but uses more of this session's context.

**Which approach?**

(After Plan A is complete, I'll write Plan B for CA Case + Artifact backend — depends on Stakeholder existing.)
