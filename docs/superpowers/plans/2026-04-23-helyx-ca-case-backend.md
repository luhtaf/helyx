# Helyx CA Case + Artifact Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Compromise Assessment (CA) graph to Helyx — `Case` as container + 11 typed `Artifact` nodes via multi-label pattern (`:Artifact:Ioc`, `:Artifact:File`, etc), full CRUD GraphQL surface per type, plus fast-path mutations for bulk-paste IOC and Wazuh alert import, plus auto-linking to existing Helyx graph entities (`:IOC`, `:Hash`, `:Tactic`/`:Technique`, `:DetectionRule`).

**Architecture:** One migration (`m013`) for all Case + Artifact constraints/indexes. Two new feature folders: `cases/` (container CRUD + lifecycle) and `artifacts/` (interface + 11 type implementations + fast paths). Multi-label pattern means cross-type queries use `MATCH (a:Artifact)` while type-specific queries use `MATCH (a:Ioc)` — both indexed.

**Tech Stack:** TypeScript ESM, Apollo Server 4 (GraphQL interface + implementing types), Neo4j 5 driver, Zod for fast-path input validation.

**Spec source:** `docs/ca-case-spec.md` (read first).

**Dependency:** **Plan A (master-data backend) must be complete and applied** — Case has a required `(:Stakeholder)` relationship.

**Project conventions (same as Plan A):**
- File ceiling 500-1000 lines; aim well below 250
- Migrations idempotent (`IF NOT EXISTS`)
- Tenant-scoped; every Cypher includes `WHERE n.tenantId = $tenantId`
- Repo functions take `tenantId: string` required
- Resolvers: `assertOrgRole(ctx, '<role>')` then call repo with `ctx.activeOrgId`
- No tests yet — verification = `pnpm typecheck` + Cypher + GraphQL Playground

---

## File Structure

**Migration (new):**
- `apps/backend/src/migrations/m013_ca_case_schema.ts` — Case + Artifact constraints + indexes

**Cases feature (new folder):**
- `apps/backend/src/cases/types.ts` — Case TS shapes, enums
- `apps/backend/src/cases/schema.ts` — GraphQL: Case, CaseStatus, CaseVerdict, ArtifactCounts, queries + mutations
- `apps/backend/src/cases/repo.ts` — CRUD + lifecycle (createCase, updateCase, closeCase, archiveCase, listCases, findCase, artifactCountsForCase)
- `apps/backend/src/cases/resolvers.ts` — VIEWER read, ANALYST write, ADMIN close/archive

**Artifacts feature (new folder):**
- `apps/backend/src/artifacts/types.ts` — Artifact base + 11 per-type TS shapes
- `apps/backend/src/artifacts/schema.ts` — GraphQL: `interface Artifact` + `ArtifactType` enum + 11 implementing types + ArtifactCounts
- `apps/backend/src/artifacts/repo.ts` — generic (listByCase, listByType, deleteArtifact) + 11 per-type create functions
- `apps/backend/src/artifacts/resolvers.ts` — Artifact `__resolveType`, per-type resolvers, bulk-paste, Wazuh import
- `apps/backend/src/artifacts/ioc-detect.ts` — pure regex IP/domain/url/email/hash detector for bulk paste
- `apps/backend/src/artifacts/wazuh-parser.ts` — pure parser: Wazuh alert JSON → DetectionHit + LogFinding skeleton

**Wire-ups (modify existing):**
- `apps/backend/src/migrations/index.ts` — register m013
- `apps/backend/src/schema/index.ts` — add caseTypeDefs + artifactTypeDefs
- `apps/backend/src/resolvers/index.ts` — add caseResolvers + artifactResolvers

**Total new files:** 10 · **Modified files:** 3 · **Estimated total LOC:** ~1800 across new files (within ceiling per file)

---

## Out of scope (defer)

- UI (`/cases` list, `/cases/:id` detail, tab-per-type forms, bulk paste UI, Wazuh import UI) — separate plan
- Templates feature (saved artifact templates) — post-MVP
- Recently-used host dropdown — UI concern
- Audit log entries — `apps/backend/src/audits/` doesn't exist; create skeleton in this plan (Task 16 stretch)
- Case attachments (PDF, screenshots) — object storage out of graph; not in v1
- Cross-case IOC linking query — emerges naturally from `:MATCHES_IOC` global edge; no new code needed

---

## Task 1: m013 schema migration

**Files:**
- Create: `apps/backend/src/migrations/m013_ca_case_schema.ts`
- Modify: `apps/backend/src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

```typescript
import type { Migration } from './types.js';

export const m013_ca_case_schema: Migration = {
  id: '013_ca_case_schema',
  description: 'Compromise Assessment — Case container + 11 typed Artifact nodes (multi-label pattern)',
  up: [
    // Case
    `CREATE CONSTRAINT case_id_unique IF NOT EXISTS
     FOR (c:Case) REQUIRE c.id IS UNIQUE`,
    `CREATE CONSTRAINT case_report_no_unique IF NOT EXISTS
     FOR (c:Case) REQUIRE (c.tenantId, c.reportNo) IS UNIQUE`,
    `CREATE INDEX case_tenant IF NOT EXISTS
     FOR (c:Case) ON (c.tenantId)`,
    `CREATE INDEX case_status IF NOT EXISTS
     FOR (c:Case) ON (c.status)`,
    `CREATE INDEX case_deployed_at IF NOT EXISTS
     FOR (c:Case) ON (c.deployedAt)`,
    `CREATE FULLTEXT INDEX case_search IF NOT EXISTS
     FOR (c:Case) ON EACH [c.reportNo, c.title, c.trigger, c.summary]`,

    // Artifact (base label, applied to all 11 types via multi-label)
    `CREATE CONSTRAINT artifact_id_unique IF NOT EXISTS
     FOR (a:Artifact) REQUIRE a.id IS UNIQUE`,
    `CREATE INDEX artifact_case IF NOT EXISTS
     FOR (a:Artifact) ON (a.caseId)`,
    `CREATE INDEX artifact_observed_at IF NOT EXISTS
     FOR (a:Artifact) ON (a.observedAt)`,
    `CREATE INDEX artifact_tenant IF NOT EXISTS
     FOR (a:Artifact) ON (a.tenantId)`,

    // Per-type indexes (only for types with hot lookup paths)
    `CREATE INDEX artifact_ioc_value IF NOT EXISTS
     FOR (a:Ioc) ON (a.value)`,
    `CREATE INDEX artifact_file_sha256 IF NOT EXISTS
     FOR (a:File) ON (a.sha256)`,
    `CREATE INDEX artifact_process_name IF NOT EXISTS
     FOR (a:Process) ON (a.name)`,
    `CREATE INDEX artifact_detection_hit_rule_id IF NOT EXISTS
     FOR (a:DetectionHit) ON (a.ruleId)`,
  ],
};
```

- [ ] **Step 2: Register**

In `apps/backend/src/migrations/index.ts`, append `m013_ca_case_schema` after m012.

- [ ] **Step 3: Typecheck + apply + verify**

```bash
pnpm --filter @helyx/backend typecheck
pnpm --filter @helyx/backend migrate
```

In Neo4j browser:
```cypher
SHOW CONSTRAINTS WHERE name IN ['case_id_unique','case_report_no_unique','artifact_id_unique'];
SHOW INDEXES    WHERE name STARTS WITH 'case_' OR name STARTS WITH 'artifact_';
```
Expected: 3 constraints + 8 indexes (4 base + 4 per-type).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/migrations/m013_ca_case_schema.ts apps/backend/src/migrations/index.ts
git commit -m "feat(ca): m013 schema for Case + 11 typed Artifact (multi-label)"
```

---

## Task 2: Case TS types

**Files:**
- Create: `apps/backend/src/cases/types.ts`

- [ ] **Step 1: Write types**

```typescript
export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type CaseVerdict = 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN' | 'PENDING';

export interface CaseRow {
  id: string;
  reportNo: string;
  title: string | null;
  trigger: string | null;
  summary: string | null;
  status: CaseStatus;
  verdict: CaseVerdict | null;
  deployedAt: string;
  closedAt: string | null;
  stakeholderId: string;
  leadUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseInput {
  reportNo: string;
  title?: string;
  trigger?: string;
  summary?: string;
  stakeholderId: string;
  leadUserId?: string;
  deployedAt: string;  // ISO date
  status?: CaseStatus;  // default DRAFT
}

export interface CaseUpdateInput {
  title?: string;
  trigger?: string;
  summary?: string;
  status?: CaseStatus;
  leadUserId?: string;
}

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
```

(commit with Task 4)

---

## Task 3: Case GraphQL schema

**Files:**
- Create: `apps/backend/src/cases/schema.ts`

- [ ] **Step 1: Write schema**

```typescript
export const caseTypeDefs = /* GraphQL */ `
  enum CaseStatus  { DRAFT ACTIVE CLOSED ARCHIVED }
  enum CaseVerdict { CONFIRMED INCONCLUSIVE CLEAN PENDING }

  type Case {
    id: ID!
    reportNo: String!
    title: String
    trigger: String
    summary: String
    status: CaseStatus!
    verdict: CaseVerdict
    deployedAt: String!
    closedAt: String
    stakeholder: Stakeholder!
    lead: User
    artifactCount: Int!
    artifactsByType: ArtifactCounts!
    findings(limit: Int = 6): [Artifact!]!
    timeline(limit: Int = 100): [Artifact!]!
    artifacts(type: ArtifactType, severity: Severity, limit: Int = 50, offset: Int = 0): [Artifact!]!
    createdAt: String!
    updatedAt: String!
  }

  type ArtifactCounts {
    ioc: Int!
    file: Int!
    process: Int!
    network: Int!
    registry: Int!
    persistence: Int!
    account: Int!
    logFinding: Int!
    memory: Int!
    detectionHit: Int!
    note: Int!
  }

  input CaseInput {
    reportNo: String!
    title: String
    trigger: String
    summary: String
    stakeholderId: ID!
    leadUserId: ID
    deployedAt: String!
    status: CaseStatus
  }

  input CaseUpdateInput {
    title: String
    trigger: String
    summary: String
    status: CaseStatus
    leadUserId: ID
  }

  extend type Query {
    cases(stakeholderId: ID, status: [CaseStatus!], search: String, first: Int = 50, offset: Int = 0): [Case!]!
    case(id: ID!): Case
    caseByReportNo(reportNo: String!): Case
  }

  extend type Mutation {
    createCase(input: CaseInput!): Case!
    updateCase(id: ID!, input: CaseUpdateInput!): Case!
    closeCase(id: ID!, verdict: CaseVerdict!): Case!
    archiveCase(id: ID!): Case!
  }
`;
```

(commit with Task 4)

---

## Task 4: Case repo + resolvers + wire-up

**Files:**
- Create: `apps/backend/src/cases/repo.ts`
- Create: `apps/backend/src/cases/resolvers.ts`
- Modify: `apps/backend/src/schema/index.ts`
- Modify: `apps/backend/src/resolvers/index.ts`

- [ ] **Step 1: Repo (signatures + critical Cypher)**

```typescript
import { randomUUID } from 'node:crypto';
import { getSession } from '../db/driver.js';
import type { CaseRow, CaseInput, CaseUpdateInput, ArtifactCounts } from './types.js';

export async function listCases(
  tenantId: string,
  filter: { stakeholderId?: string; status?: string[]; search?: string; first?: number; offset?: number },
): Promise<CaseRow[]>;

export async function findCase(tenantId: string, id: string): Promise<CaseRow | null>;
export async function findCaseByReportNo(tenantId: string, reportNo: string): Promise<CaseRow | null>;

export async function createCase(tenantId: string, input: CaseInput): Promise<CaseRow> {
  // Cypher (illustrative — actual exec uses session.executeWrite):
  //   MATCH (k:Stakeholder {id: $stakeholderId, tenantId: $tenantId})
  //   CREATE (c:Case {
  //     id: randomUUID(), tenantId: $tenantId,
  //     reportNo: $reportNo, title: $title, trigger: $trigger, summary: $summary,
  //     status: coalesce($status, 'DRAFT'), verdict: 'PENDING',
  //     deployedAt: datetime($deployedAt),
  //     stakeholderId: $stakeholderId,
  //     leadUserId: $leadUserId,
  //     createdAt: datetime(), updatedAt: datetime()
  //   })
  //   MERGE (c)-[:ASSESSED]->(k)
  //   WITH c
  //   FOREACH (uid IN CASE WHEN $leadUserId IS NULL THEN [] ELSE [$leadUserId] END |
  //     MATCH (u:User {id: uid}) MERGE (c)-[:LED_BY]->(u))
  //   RETURN c
}

export async function updateCase(tenantId: string, id: string, input: CaseUpdateInput): Promise<CaseRow>;

export async function closeCase(tenantId: string, id: string, verdict: 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN'): Promise<CaseRow> {
  // SET c.status = 'CLOSED', c.verdict = $verdict, c.closedAt = datetime(), c.updatedAt = datetime()
  // WHERE c.status = 'ACTIVE' (lifecycle guard — only active cases can close)
}

export async function archiveCase(tenantId: string, id: string): Promise<CaseRow>;

export async function artifactCountsForCase(caseId: string, tenantId: string): Promise<ArtifactCounts> {
  // Single Cypher with conditional counts to avoid 11 round-trips:
  //   MATCH (c:Case {id: $caseId, tenantId: $tenantId})<-[:HAS_ARTIFACT]-(a:Artifact)
  //   WITH a
  //   RETURN
  //     count(CASE WHEN a:Ioc          THEN 1 END) AS ioc,
  //     count(CASE WHEN a:File         THEN 1 END) AS file,
  //     count(CASE WHEN a:Process      THEN 1 END) AS process,
  //     count(CASE WHEN a:Network      THEN 1 END) AS network,
  //     count(CASE WHEN a:Registry     THEN 1 END) AS registry,
  //     count(CASE WHEN a:Persistence  THEN 1 END) AS persistence,
  //     count(CASE WHEN a:Account      THEN 1 END) AS account,
  //     count(CASE WHEN a:LogFinding   THEN 1 END) AS logFinding,
  //     count(CASE WHEN a:Memory       THEN 1 END) AS memory,
  //     count(CASE WHEN a:DetectionHit THEN 1 END) AS detectionHit,
  //     count(CASE WHEN a:Note         THEN 1 END) AS note
}

export async function totalArtifactCount(caseId: string, tenantId: string): Promise<number>;

function rowToCase(rec: { get: (k: string) => unknown }): CaseRow { /* standard shape */ }
```

> Lifecycle guards: `closeCase` MUST require status=ACTIVE; `archiveCase` MUST require status=CLOSED. Use `WHERE` in Cypher and throw `GraphQLError({ extensions: { code: 'INVALID_TRANSITION' } })` if no row updated.

- [ ] **Step 2: Resolvers**

```typescript
import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import { findStakeholder } from '../stakeholders/repo.js';
import {
  archiveCase, artifactCountsForCase, closeCase, createCase, findCase,
  findCaseByReportNo, listCases, totalArtifactCount, updateCase,
  type CaseRow,
} from './repo.js';
import { listFindings, listTimeline, listArtifactsByCase } from '../artifacts/repo.js';
import type { CaseInput, CaseUpdateInput } from './types.js';

export const caseResolvers = {
  Query: {
    cases: (_p: unknown, args: { stakeholderId?: string; status?: string[]; search?: string; first?: number; offset?: number }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listCases(ctx.activeOrgId, args);
    },
    case: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findCase(ctx.activeOrgId, args.id);
    },
    caseByReportNo: (_p: unknown, args: { reportNo: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findCaseByReportNo(ctx.activeOrgId, args.reportNo);
    },
  },
  Mutation: {
    createCase: (_p: unknown, args: { input: CaseInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return createCase(ctx.activeOrgId, args.input);
    },
    updateCase: (_p: unknown, args: { id: string; input: CaseUpdateInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return updateCase(ctx.activeOrgId, args.id, args.input);
    },
    closeCase: (_p: unknown, args: { id: string; verdict: 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN' }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return closeCase(ctx.activeOrgId, args.id, args.verdict);
    },
    archiveCase: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      return archiveCase(ctx.activeOrgId, args.id);
    },
  },
  Case: {
    stakeholder: (parent: CaseRow, _a: unknown, ctx: RequestContext) =>
      findStakeholder(ctx.activeOrgId!, parent.stakeholderId),
    artifactCount: (parent: CaseRow, _a: unknown, ctx: RequestContext) =>
      totalArtifactCount(parent.id, ctx.activeOrgId!),
    artifactsByType: (parent: CaseRow, _a: unknown, ctx: RequestContext) =>
      artifactCountsForCase(parent.id, ctx.activeOrgId!),
    findings: (parent: CaseRow, args: { limit: number }, ctx: RequestContext) =>
      listFindings(ctx.activeOrgId!, parent.id, args.limit),
    timeline: (parent: CaseRow, args: { limit: number }, ctx: RequestContext) =>
      listTimeline(ctx.activeOrgId!, parent.id, args.limit),
    artifacts: (parent: CaseRow, args: { type?: string; severity?: string; limit: number; offset: number }, ctx: RequestContext) =>
      listArtifactsByCase(ctx.activeOrgId!, parent.id, args),
    lead: (_parent: CaseRow) => null,  // User resolver TBD when User node introspection lands
  },
};
```

> Note: `artifactsByType` and `findings`/`timeline` reference functions in `artifacts/repo.ts` (Task 6). For now stub those imports — Task 4 commits compile because Task 6 will land before Task 4 is verified end-to-end.

- [ ] **Step 3: Wire into aggregators**

Add `caseTypeDefs` + `caseResolvers` to `schema/index.ts` and `resolvers/index.ts`. Order matters: ensure `artifactTypeDefs` (Task 5) comes BEFORE `caseTypeDefs` since `Case.findings: [Artifact!]!` references `Artifact`.

For now, register a stub `interface Artifact { id: ID! }` in caseTypeDefs as a placeholder so Apollo doesn't fail — replace with real artifactTypeDefs in Task 5.

```typescript
// In caseTypeDefs at the very top — temporary stub:
//   interface Artifact { id: ID! }
//   enum ArtifactType { IOC FILE PROCESS NETWORK REGISTRY PERSISTENCE ACCOUNT LOG_FINDING MEMORY DETECTION_HIT NOTE }
//   enum Severity { INFO LOW MEDIUM HIGH CRITICAL }
```

Once Task 5 schema lands, REMOVE this stub from caseTypeDefs (collision will fail server start).

- [ ] **Step 4: Typecheck + start backend + manual verify**

```bash
pnpm --filter @helyx/backend typecheck
pnpm --filter @helyx/backend dev
```

GraphQL Playground:
```graphql
mutation { createCase(input: {
  reportNo: "001/CA/CTH/04/2026",
  title: "Test case",
  stakeholderId: "<from Plan A>",
  deployedAt: "2026-04-23T00:00:00Z"
}) { id reportNo status verdict stakeholder { name } } }
```
Expected: case created with status DRAFT, verdict PENDING.

```graphql
query { cases { id reportNo status stakeholder { name } artifactCount } }
```
Expected: 1 case, artifactCount 0.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cases/ apps/backend/src/schema/index.ts apps/backend/src/resolvers/index.ts
git commit -m "feat(ca): Case CRUD + lifecycle (create/update/close/archive)"
```

---

## Task 5: Artifact base schema (interface + enums + 11 type defs)

**Files:**
- Create: `apps/backend/src/artifacts/schema.ts`
- Create: `apps/backend/src/artifacts/types.ts`
- Modify: `apps/backend/src/schema/index.ts` (replace stub with real artifactTypeDefs)

- [ ] **Step 1: Types**

```typescript
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ArtifactType =
  | 'IOC' | 'FILE' | 'PROCESS' | 'NETWORK' | 'REGISTRY' | 'PERSISTENCE'
  | 'ACCOUNT' | 'LOG_FINDING' | 'MEMORY' | 'DETECTION_HIT' | 'NOTE';

export interface ArtifactBaseRow {
  id: string;
  caseId: string;
  type: ArtifactType;
  observedAt: string;
  hostAssetId: string | null;
  severity: Severity;
  confidence: Confidence;
  notes: string | null;
  tags: string[];
  addedByUserId: string;
  addedAt: string;
}

// Per-type extension shapes (each extends ArtifactBaseRow at runtime):
export interface IocFields {
  iocType: 'IP' | 'DOMAIN' | 'URL' | 'EMAIL' | 'HASH';
  value: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'BOTH' | null;
  firstSeen: string | null;
  lastSeen: string | null;
  source: string | null;
}
export interface FileFields {
  filename: string;
  filepath: string | null;
  md5: string | null;
  sha1: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  mime: string | null;
  signed: boolean | null;
  signer: string | null;
  behavior: string[];
}
export interface ProcessFields {
  name: string;
  pid: number | null;
  commandLine: string | null;
  parentName: string | null;
  user: string | null;
  startedAt: string | null;
  ttpHints: string[];
}
export interface NetworkFields {
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'HTTP' | 'DNS';
  srcIp: string;
  srcPort: number | null;
  dstIp: string;
  dstPort: number | null;
  direction: 'INBOUND' | 'OUTBOUND' | 'LATERAL' | null;
  bytes: number | null;
  connectionStartedAt: string | null;
}
export interface RegistryFields {
  hive: 'HKLM' | 'HKCU' | 'HKCR' | 'HKU' | 'HKCC';
  keyPath: string;
  valueName: string | null;
  valueData: string | null;
  action: 'CREATED' | 'MODIFIED' | 'DELETED';
}
export interface PersistenceFields {
  mechanism: 'SCHEDULED_TASK' | 'SERVICE' | 'STARTUP_FOLDER' | 'RUN_KEY' | 'WMI' | 'CRON' | 'SYSTEMD' | 'LAUNCHD' | 'OTHER';
  name: string;
  target: string | null;
  user: string | null;
  createdAtSrc: string | null;
}
export interface AccountFields {
  username: string;
  domain: string | null;
  action: 'CREATED' | 'PRIVILEGE_ESCALATED' | 'DISABLED' | 'PASSWORD_CHANGED' | 'LOGIN_ANOMALY';
  privileges: string[];
  sourceIp: string | null;
}
export interface LogFindingFields {
  logSource: string;
  eventId: string | null;
  timestamp: string;
  rawLine: string | null;
  observation: string;
}
export interface MemoryFields {
  processName: string;
  pid: number | null;
  finding: 'PROCESS_INJECTION' | 'HOLLOWING' | 'SHELLCODE' | 'UNBACKED_MEMORY' | 'STRINGS_MATCH' | 'OTHER';
  evidence: string | null;
  toolUsed: string | null;
}
export interface DetectionHitFields {
  ruleSource: 'SIGMA' | 'YARA' | 'WAZUH' | 'ELASTIC' | 'CUSTOM';
  ruleId: string;
  ruleName: string;
  firedAt: string;
  count: number | null;
}
export interface NoteFields {
  title: string | null;
  body: string;
  author: string;
}
```

- [ ] **Step 2: GraphQL schema**

```typescript
export const artifactTypeDefs = /* GraphQL */ `
  enum ArtifactType { IOC FILE PROCESS NETWORK REGISTRY PERSISTENCE ACCOUNT LOG_FINDING MEMORY DETECTION_HIT NOTE }
  enum Severity { INFO LOW MEDIUM HIGH CRITICAL }
  enum Confidence { LOW MEDIUM HIGH }
  enum IocType { IP DOMAIN URL EMAIL HASH }
  enum Direction { INBOUND OUTBOUND BOTH LATERAL }
  enum NetProtocol { TCP UDP ICMP HTTP DNS }
  enum RegistryHive { HKLM HKCU HKCR HKU HKCC }
  enum RegistryAction { CREATED MODIFIED DELETED }
  enum PersistenceMechanism { SCHEDULED_TASK SERVICE STARTUP_FOLDER RUN_KEY WMI CRON SYSTEMD LAUNCHD OTHER }
  enum AccountAction { CREATED PRIVILEGE_ESCALATED DISABLED PASSWORD_CHANGED LOGIN_ANOMALY }
  enum MemoryFinding { PROCESS_INJECTION HOLLOWING SHELLCODE UNBACKED_MEMORY STRINGS_MATCH OTHER }
  enum RuleSource { SIGMA YARA WAZUH ELASTIC CUSTOM }

  interface Artifact {
    id: ID!
    caseId: ID!
    type: ArtifactType!
    observedAt: String!
    host: Asset
    severity: Severity!
    confidence: Confidence!
    notes: String
    tags: [String!]!
    addedAt: String!
  }

  type IocArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    iocType: IocType!
    value: String!
    direction: Direction
    firstSeen: String
    lastSeen: String
    source: String
  }

  type FileArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    filename: String!
    filepath: String
    md5: String
    sha1: String
    sha256: String
    sizeBytes: Int
    mime: String
    signed: Boolean
    signer: String
    behavior: [String!]!
  }

  type ProcessArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    name: String!
    pid: Int
    commandLine: String
    parentName: String
    user: String
    startedAt: String
    ttpHints: [String!]!
  }

  type NetworkArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    protocol: NetProtocol!
    srcIp: String!
    srcPort: Int
    dstIp: String!
    dstPort: Int
    direction: Direction
    bytes: Int
    connectionStartedAt: String
  }

  type RegistryArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    hive: RegistryHive!
    keyPath: String!
    valueName: String
    valueData: String
    action: RegistryAction!
  }

  type PersistenceArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    mechanism: PersistenceMechanism!
    name: String!
    target: String
    user: String
    createdAtSrc: String
  }

  type AccountArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    username: String!
    domain: String
    action: AccountAction!
    privileges: [String!]!
    sourceIp: String
  }

  type LogFindingArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    logSource: String!
    eventId: String
    timestamp: String!
    rawLine: String
    observation: String!
  }

  type MemoryArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    processName: String!
    pid: Int
    finding: MemoryFinding!
    evidence: String
    toolUsed: String
  }

  type DetectionHitArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    ruleSource: RuleSource!
    ruleId: String!
    ruleName: String!
    firedAt: String!
    count: Int
  }

  type NoteArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    title: String
    body: String!
    author: String!
  }

  # Inputs (one per type — verbose but explicit)
  input ArtifactBaseInput {
    observedAt: String!
    hostAssetId: ID
    severity: Severity!
    confidence: Confidence!
    notes: String
    tags: [String!]
  }

  input IocArtifactInput { base: ArtifactBaseInput!, iocType: IocType!, value: String!, direction: Direction, firstSeen: String, lastSeen: String, source: String }
  input FileArtifactInput { base: ArtifactBaseInput!, filename: String!, filepath: String, md5: String, sha1: String, sha256: String, sizeBytes: Int, mime: String, signed: Boolean, signer: String, behavior: [String!] }
  input ProcessArtifactInput { base: ArtifactBaseInput!, name: String!, pid: Int, commandLine: String, parentName: String, user: String, startedAt: String, ttpHints: [String!] }
  input NetworkArtifactInput { base: ArtifactBaseInput!, protocol: NetProtocol!, srcIp: String!, srcPort: Int, dstIp: String!, dstPort: Int, direction: Direction, bytes: Int, connectionStartedAt: String }
  input RegistryArtifactInput { base: ArtifactBaseInput!, hive: RegistryHive!, keyPath: String!, valueName: String, valueData: String, action: RegistryAction! }
  input PersistenceArtifactInput { base: ArtifactBaseInput!, mechanism: PersistenceMechanism!, name: String!, target: String, user: String, createdAtSrc: String }
  input AccountArtifactInput { base: ArtifactBaseInput!, username: String!, domain: String, action: AccountAction!, privileges: [String!], sourceIp: String }
  input LogFindingArtifactInput { base: ArtifactBaseInput!, logSource: String!, eventId: String, timestamp: String!, rawLine: String, observation: String! }
  input MemoryArtifactInput { base: ArtifactBaseInput!, processName: String!, pid: Int, finding: MemoryFinding!, evidence: String, toolUsed: String }
  input DetectionHitArtifactInput { base: ArtifactBaseInput!, ruleSource: RuleSource!, ruleId: String!, ruleName: String!, firedAt: String!, count: Int }
  input NoteArtifactInput { base: ArtifactBaseInput!, title: String, body: String!, author: ID! }

  extend type Mutation {
    createIocArtifact(caseId: ID!, input: IocArtifactInput!): IocArtifact!
    createFileArtifact(caseId: ID!, input: FileArtifactInput!): FileArtifact!
    createProcessArtifact(caseId: ID!, input: ProcessArtifactInput!): ProcessArtifact!
    createNetworkArtifact(caseId: ID!, input: NetworkArtifactInput!): NetworkArtifact!
    createRegistryArtifact(caseId: ID!, input: RegistryArtifactInput!): RegistryArtifact!
    createPersistenceArtifact(caseId: ID!, input: PersistenceArtifactInput!): PersistenceArtifact!
    createAccountArtifact(caseId: ID!, input: AccountArtifactInput!): AccountArtifact!
    createLogFindingArtifact(caseId: ID!, input: LogFindingArtifactInput!): LogFindingArtifact!
    createMemoryArtifact(caseId: ID!, input: MemoryArtifactInput!): MemoryArtifact!
    createDetectionHitArtifact(caseId: ID!, input: DetectionHitArtifactInput!): DetectionHitArtifact!
    createNoteArtifact(caseId: ID!, input: NoteArtifactInput!): NoteArtifact!

    bulkCreateIocArtifacts(caseId: ID!, base: ArtifactBaseInput!, values: [String!]!): [IocArtifact!]!
    importWazuhAlert(caseId: ID!, alertJson: String!): [Artifact!]!

    deleteArtifact(id: ID!): Boolean!
  }
`;
```

- [ ] **Step 3: Replace the stub in caseTypeDefs (Task 4) and wire artifactTypeDefs into schema/index.ts BEFORE caseTypeDefs**

Schema-merging order matters in `apollo-server`-style stitched schemas: types referenced in another typeDef must be defined or extended first. Since interface `Artifact` is referenced from `Case.findings` (Task 4), `artifactTypeDefs` must be added to the array BEFORE `caseTypeDefs`.

- [ ] **Step 4: Typecheck**

Expected: PASS.

(commit with Task 6)

---

## Task 6: Artifact base repo (generic queries)

**Files:**
- Create: `apps/backend/src/artifacts/repo.ts` (generic functions only — per-type creates land in Tasks 7-10)

- [ ] **Step 1: Generic functions**

```typescript
import { randomUUID } from 'node:crypto';
import { getSession } from '../db/driver.js';
import type { ArtifactBaseRow, ArtifactType, Severity } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};

export async function listArtifactsByCase(
  tenantId: string,
  caseId: string,
  filter: { type?: string; severity?: string; limit: number; offset: number },
): Promise<ArtifactBaseRow[]> {
  // MATCH (c:Case {id: $caseId, tenantId: $tenantId})<-[:HAS_ARTIFACT]-(a:Artifact)
  // WHERE ($type IS NULL OR labels(a) CONTAINS $typeLabel)
  //   AND ($severity IS NULL OR a.severity = $severity)
  // RETURN a, labels(a) as labels
  // ORDER BY a.observedAt DESC SKIP $offset LIMIT $limit
  // — `labels(a)` used by __resolveType to pick the right GraphQL type
}

export async function listFindings(
  tenantId: string,
  caseId: string,
  limit: number,
): Promise<ArtifactBaseRow[]> {
  // High-confidence + high-severity subset.
  // WHERE a.confidence = 'HIGH' AND a.severity IN ['HIGH', 'CRITICAL']
  // ORDER BY <severity rank desc>, a.observedAt DESC LIMIT $limit
}

export async function listTimeline(
  tenantId: string,
  caseId: string,
  limit: number,
): Promise<ArtifactBaseRow[]> {
  // ORDER BY a.observedAt ASC LIMIT $limit
}

export async function findArtifact(tenantId: string, id: string): Promise<{ row: ArtifactBaseRow; labels: string[] } | null>;

export async function deleteArtifact(tenantId: string, id: string): Promise<boolean> {
  // DETACH DELETE artifact (also drops MATCHES_IOC/MATCHES_HASH/etc edges)
  // Return true if a node was deleted, else false
}

// Helper used by per-type creates (Tasks 7-10)
export interface CreateArtifactBase {
  type: ArtifactType;
  observedAt: string;
  hostAssetId: string | null;
  severity: Severity;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  notes: string | null;
  tags: string[];
  addedByUserId: string;
}

export interface CreateArtifactSpec {
  typeLabel: string;     // e.g. 'Ioc', 'File' — multi-label applied alongside :Artifact
  typeFields: Record<string, unknown>;  // type-specific fields written via SET a += $typeFields
}

export async function createArtifactNode(
  tenantId: string,
  caseId: string,
  base: CreateArtifactBase,
  spec: CreateArtifactSpec,
): Promise<ArtifactBaseRow & Record<string, unknown>> {
  // Single Cypher:
  //   MATCH (c:Case {id: $caseId, tenantId: $tenantId})
  //   WHERE c.status IN ['DRAFT', 'ACTIVE']  // can't add artifact to closed/archived case
  //   CREATE (a:Artifact)
  //   SET a:`${typeLabel}`,                    // multi-label add
  //       a.id = randomUUID(),
  //       a.tenantId = $tenantId,
  //       a.caseId = $caseId,
  //       a.type = $type,
  //       a.observedAt = datetime($observedAt),
  //       a.severity = $severity,
  //       a.confidence = $confidence,
  //       a.notes = $notes,
  //       a.tags = $tags,
  //       a.addedByUserId = $addedByUserId,
  //       a.addedAt = datetime(),
  //       a += $typeFields
  //   MERGE (c)-[:HAS_ARTIFACT]->(a)
  //   WITH a, $hostAssetId AS hostId
  //   FOREACH (h IN CASE WHEN hostId IS NULL THEN [] ELSE [hostId] END |
  //     MATCH (asset:Asset {id: h, tenantId: $tenantId}) MERGE (a)-[:ON_HOST]->(asset))
  //   RETURN a, labels(a) AS labels
}

// Auto-link helpers (Task 9)
export async function linkIocToGlobalIoc(artifactId: string, value: string): Promise<void>;
export async function linkFileToHash(artifactId: string, sha256: string): Promise<void>;
export async function linkProcessToTtp(artifactId: string, ttpIds: string[]): Promise<void>;
export async function linkDetectionHitToRule(artifactId: string, ruleId: string): Promise<void>;
```

> Note: `:`${typeLabel}`` — typeLabel comes from a closed enum (the 11 type names hardcoded in createArtifactSpec call sites). Cypher label injection via backticks is safe ONLY because the value is from our own code, never user input.

- [ ] **Step 2: Typecheck + commit (Tasks 5+6 together)**

```bash
pnpm --filter @helyx/backend typecheck
git add apps/backend/src/artifacts/types.ts apps/backend/src/artifacts/schema.ts apps/backend/src/artifacts/repo.ts apps/backend/src/cases/repo.ts apps/backend/src/cases/resolvers.ts apps/backend/src/schema/index.ts apps/backend/src/resolvers/index.ts
git commit -m "feat(ca): Artifact interface + 11 type schemas + base repo"
```

---

## Task 7: IOC + File artifact resolvers (most common types)

**Files:**
- Create (extending): `apps/backend/src/artifacts/resolvers.ts`

- [ ] **Step 1: __resolveType + IOC + File creators**

```typescript
import { GraphQLError } from 'graphql';
import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import { findAssetById } from '../assets/repo.js';  // verify this exists; if not, simplify
import {
  createArtifactNode, deleteArtifact, findArtifact,
  linkFileToHash, linkIocToGlobalIoc,
  type CreateArtifactBase,
} from './repo.js';
import type {
  ArtifactBaseRow, IocFields, FileFields,
} from './types.js';

const TYPE_TO_LABEL: Record<string, string> = {
  IOC: 'Ioc', FILE: 'File', PROCESS: 'Process', NETWORK: 'Network',
  REGISTRY: 'Registry', PERSISTENCE: 'Persistence', ACCOUNT: 'Account',
  LOG_FINDING: 'LogFinding', MEMORY: 'Memory', DETECTION_HIT: 'DetectionHit',
  NOTE: 'Note',
};
const LABEL_TO_GQL_TYPE: Record<string, string> = {
  Ioc: 'IocArtifact', File: 'FileArtifact', Process: 'ProcessArtifact',
  Network: 'NetworkArtifact', Registry: 'RegistryArtifact', Persistence: 'PersistenceArtifact',
  Account: 'AccountArtifact', LogFinding: 'LogFindingArtifact', Memory: 'MemoryArtifact',
  DetectionHit: 'DetectionHitArtifact', Note: 'NoteArtifact',
};

function pickArtifactGqlType(labels: string[]): string {
  for (const l of labels) {
    if (LABEL_TO_GQL_TYPE[l]) return LABEL_TO_GQL_TYPE[l];
  }
  throw new GraphQLError(`Cannot resolve artifact type from labels: ${labels.join(',')}`);
}

function baseFromInput(input: { base: { observedAt: string; hostAssetId?: string; severity: 'INFO'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; confidence: 'LOW'|'MEDIUM'|'HIGH'; notes?: string; tags?: string[] } }, type: string, userId: string): CreateArtifactBase {
  return {
    type: type as CreateArtifactBase['type'],
    observedAt: input.base.observedAt,
    hostAssetId: input.base.hostAssetId ?? null,
    severity: input.base.severity,
    confidence: input.base.confidence,
    notes: input.base.notes ?? null,
    tags: input.base.tags ?? [],
    addedByUserId: userId,
  };
}

export const artifactResolvers = {
  Artifact: {
    __resolveType: (parent: ArtifactBaseRow & { __labels?: string[] }) => {
      if (!parent.__labels) throw new GraphQLError('artifact missing __labels (resolver bug)');
      return pickArtifactGqlType(parent.__labels);
    },
    host: (parent: ArtifactBaseRow, _a: unknown, ctx: RequestContext) =>
      parent.hostAssetId ? findAssetById(parent.hostAssetId, ctx.activeOrgId!) : null,
  },

  Mutation: {
    createIocArtifact: async (_p: unknown, args: { caseId: string; input: { base: any } & IocFields }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(ctx.activeOrgId, args.caseId,
        baseFromInput(args.input, 'IOC', ctx.user.id),
        {
          typeLabel: 'Ioc',
          typeFields: {
            iocType: args.input.iocType,
            value: args.input.value,
            direction: args.input.direction ?? null,
            firstSeen: args.input.firstSeen ?? null,
            lastSeen: args.input.lastSeen ?? null,
            source: args.input.source ?? null,
          },
        });
      await linkIocToGlobalIoc(created.id, args.input.value);
      return created;
    },

    createFileArtifact: async (_p: unknown, args: { caseId: string; input: { base: any } & FileFields }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(ctx.activeOrgId, args.caseId,
        baseFromInput(args.input, 'FILE', ctx.user.id),
        {
          typeLabel: 'File',
          typeFields: {
            filename: args.input.filename,
            filepath: args.input.filepath ?? null,
            md5: args.input.md5 ?? null,
            sha1: args.input.sha1 ?? null,
            sha256: args.input.sha256 ?? null,
            sizeBytes: args.input.sizeBytes ?? null,
            mime: args.input.mime ?? null,
            signed: args.input.signed ?? null,
            signer: args.input.signer ?? null,
            behavior: args.input.behavior ?? [],
          },
        });
      if (args.input.sha256) await linkFileToHash(created.id, args.input.sha256);
      return created;
    },

    deleteArtifact: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return deleteArtifact(ctx.activeOrgId, args.id);
    },
  },
};
```

- [ ] **Step 2: Wire artifactResolvers into resolvers/index.ts**

Deep-merge into the resolvers map (Mutation block + new Artifact union resolver).

- [ ] **Step 3: Typecheck + start backend**

```bash
pnpm --filter @helyx/backend typecheck
pnpm --filter @helyx/backend dev
```

GraphQL Playground:
```graphql
mutation { createIocArtifact(caseId: "<caseId>", input: {
  base: { observedAt: "2026-04-23T10:00:00Z", severity: HIGH, confidence: HIGH },
  iocType: IP, value: "203.0.113.42", direction: OUTBOUND, source: "manual"
}) { id type value iocType severity } }
```
Expected: artifact created.

```graphql
query { case(id: "<caseId>") { artifactCount artifactsByType { ioc file } } }
```
Expected: artifactCount 1, ioc 1, file 0.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/artifacts/resolvers.ts apps/backend/src/resolvers/index.ts
git commit -m "feat(ca): IOC + File artifact resolvers + auto-link to global graph"
```

---

## Task 8: Process + Network + Registry artifact resolvers

**Files:**
- Modify: `apps/backend/src/artifacts/resolvers.ts` (add 3 mutations)

- [ ] **Step 1: Add mutations following the IOC/File pattern**

Same template — `createXyzArtifact` calls `createArtifactNode` with the right `typeLabel` + `typeFields`. For `createProcessArtifact`, after node creation, call `linkProcessToTtp(created.id, ttpHints)` if ttpHints non-empty.

- [ ] **Step 2: Typecheck + spot-check one mutation in Playground**

```graphql
mutation { createProcessArtifact(caseId: "<caseId>", input: {
  base: { observedAt: "2026-04-23T10:00:00Z", severity: HIGH, confidence: HIGH },
  name: "powershell.exe", commandLine: "powershell -enc <b64>",
  ttpHints: ["T1059.001"]
}) { id name ttpHints severity } }
```
Expected: artifact created, T1059.001 linked to MITRE Technique node if it exists in the graph.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(ca): Process + Network + Registry artifact resolvers"
```

---

## Task 9: Persistence + Account + LogFinding + Memory + DetectionHit + Note

**Files:**
- Modify: `apps/backend/src/artifacts/resolvers.ts`
- Modify: `apps/backend/src/artifacts/repo.ts` (already has linkDetectionHitToRule from Task 6 — wire it in)

- [ ] **Step 1: Add 6 more create mutations (same template)**

For `createDetectionHitArtifact`, after create, call `linkDetectionHitToRule(created.id, ruleId)`.

For `createNoteArtifact`, no auto-link.

- [ ] **Step 2: Typecheck + spot-check 2 mutations**

Note + DetectionHit are the most distinctive shapes — verify both:

```graphql
mutation {
  createNoteArtifact(caseId: "<caseId>", input: {
    base: { observedAt: "2026-04-23T11:00:00Z", severity: INFO, confidence: HIGH },
    body: "Initial triage notes...", author: "<userId>"
  }) { id body author }
}
```

```graphql
mutation {
  createDetectionHitArtifact(caseId: "<caseId>", input: {
    base: { observedAt: "2026-04-23T11:00:00Z", severity: HIGH, confidence: HIGH },
    ruleSource: SIGMA, ruleId: "abc-123", ruleName: "Suspicious PowerShell Execution",
    firedAt: "2026-04-23T10:55:00Z", count: 3
  }) { id ruleId ruleName firedAt }
}
```

- [ ] **Step 3: Verify counts roll up**

```graphql
query { case(id: "<caseId>") { artifactsByType { ioc file process network registry persistence account logFinding memory detectionHit note } } }
```
Expected: each count matches what you created in Tasks 7-9.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(ca): Persistence + Account + LogFinding + Memory + DetectionHit + Note artifact resolvers"
```

---

## Task 10: Bulk paste IOC + Wazuh import

**Files:**
- Create: `apps/backend/src/artifacts/ioc-detect.ts` (pure regex)
- Create: `apps/backend/src/artifacts/wazuh-parser.ts` (pure parser)
- Modify: `apps/backend/src/artifacts/resolvers.ts` (add 2 mutations)

- [ ] **Step 1: ioc-detect.ts**

```typescript
export type DetectedIocType = 'IP' | 'DOMAIN' | 'URL' | 'EMAIL' | 'HASH';

const PATTERNS: Array<{ type: DetectedIocType; rx: RegExp }> = [
  { type: 'URL',    rx: /^https?:\/\/[^\s]+$/i },
  { type: 'EMAIL',  rx: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { type: 'IP',     rx: /^(\d{1,3}\.){3}\d{1,3}$/ },
  { type: 'HASH',   rx: /^[a-f0-9]{32,128}$/i },  // md5/sha1/sha256/sha512 lengths
  { type: 'DOMAIN', rx: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i },
];

export function detectIocType(value: string): DetectedIocType | null {
  const v = value.trim();
  if (!v) return null;
  for (const p of PATTERNS) if (p.rx.test(v)) return p.type;
  return null;
}

export function bulkParseIocs(blob: string): Array<{ value: string; iocType: DetectedIocType }> {
  return blob
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => ({ value, iocType: detectIocType(value) }))
    .filter((x): x is { value: string; iocType: DetectedIocType } => x.iocType !== null);
}
```

- [ ] **Step 2: wazuh-parser.ts**

```typescript
import { z } from 'zod';

const WazuhAlert = z.object({
  rule: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    description: z.string().optional(),
    level: z.number().optional(),
  }).optional(),
  agent: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  '@timestamp': z.string().optional(),
  full_log: z.string().optional(),
  decoder: z.object({ name: z.string().optional() }).optional(),
}).passthrough();

export interface ParsedWazuhAlert {
  detectionHit: {
    ruleSource: 'WAZUH';
    ruleId: string;
    ruleName: string;
    firedAt: string;
    severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  logFinding: {
    logSource: string;
    timestamp: string;
    rawLine: string;
    observation: string;
  } | null;
}

export function parseWazuhAlert(json: string): ParsedWazuhAlert {
  const parsed = WazuhAlert.parse(JSON.parse(json));
  const level = parsed.rule?.level ?? 0;
  const severity = level >= 12 ? 'CRITICAL' : level >= 9 ? 'HIGH' : level >= 6 ? 'MEDIUM' : level >= 3 ? 'LOW' : 'INFO';
  const firedAt = parsed['@timestamp'] ?? new Date().toISOString();
  return {
    detectionHit: {
      ruleSource: 'WAZUH',
      ruleId: parsed.rule?.id ?? 'unknown',
      ruleName: parsed.rule?.description ?? '(no description)',
      firedAt,
      severity,
    },
    logFinding: parsed.full_log ? {
      logSource: parsed.decoder?.name ?? 'wazuh',
      timestamp: firedAt,
      rawLine: parsed.full_log,
      observation: parsed.rule?.description ?? '(imported from Wazuh alert)',
    } : null,
  };
}
```

- [ ] **Step 3: Add bulk + import mutations**

```typescript
// In artifactResolvers.Mutation:
bulkCreateIocArtifacts: async (_p, args: { caseId: string; base: any; values: string[] }, ctx) => {
  assertOrgRole(ctx, 'ANALYST');
  const items = bulkParseIocs(args.values.join('\n'));
  const created = [];
  for (const item of items) {
    const node = await createArtifactNode(ctx.activeOrgId, args.caseId,
      baseFromInput({ base: args.base }, 'IOC', ctx.user.id),
      { typeLabel: 'Ioc', typeFields: { iocType: item.iocType, value: item.value, direction: null, firstSeen: null, lastSeen: null, source: 'bulk-paste' } });
    await linkIocToGlobalIoc(node.id, item.value);
    created.push(node);
  }
  return created;
},

importWazuhAlert: async (_p, args: { caseId: string; alertJson: string }, ctx) => {
  assertOrgRole(ctx, 'ANALYST');
  const parsed = parseWazuhAlert(args.alertJson);
  const out = [];
  const dh = await createArtifactNode(ctx.activeOrgId, args.caseId,
    baseFromInput({ base: { observedAt: parsed.detectionHit.firedAt, severity: parsed.detectionHit.severity, confidence: 'MEDIUM' } }, 'DETECTION_HIT', ctx.user.id),
    { typeLabel: 'DetectionHit', typeFields: { ruleSource: 'WAZUH', ruleId: parsed.detectionHit.ruleId, ruleName: parsed.detectionHit.ruleName, firedAt: parsed.detectionHit.firedAt, count: 1 } });
  await linkDetectionHitToRule(dh.id, parsed.detectionHit.ruleId);
  out.push(dh);
  if (parsed.logFinding) {
    const lf = await createArtifactNode(ctx.activeOrgId, args.caseId,
      baseFromInput({ base: { observedAt: parsed.logFinding.timestamp, severity: parsed.detectionHit.severity, confidence: 'MEDIUM' } }, 'LOG_FINDING', ctx.user.id),
      { typeLabel: 'LogFinding', typeFields: { logSource: parsed.logFinding.logSource, eventId: null, timestamp: parsed.logFinding.timestamp, rawLine: parsed.logFinding.rawLine, observation: parsed.logFinding.observation } });
    out.push(lf);
  }
  return out;
},
```

- [ ] **Step 4: Typecheck + verify**

```graphql
mutation { bulkCreateIocArtifacts(caseId: "<caseId>",
  base: { observedAt: "2026-04-23T12:00:00Z", severity: MEDIUM, confidence: MEDIUM },
  values: ["1.2.3.4", "evil.example.com", "https://bad.example.com/payload", "5d41402abc4b2a76b9719d911017c592"]
) { id iocType value } }
```
Expected: 4 artifacts (1 IP, 1 DOMAIN, 1 URL, 1 HASH).

```graphql
mutation { importWazuhAlert(caseId: "<caseId>", alertJson: "{\"rule\":{\"id\":\"100002\",\"description\":\"sshd brute force\",\"level\":10},\"@timestamp\":\"2026-04-23T13:00:00Z\",\"full_log\":\"Apr 23 13:00:00 host sshd: failed login\",\"decoder\":{\"name\":\"sshd\"}}") { id type } }
```
Expected: 2 artifacts created (DetectionHit + LogFinding).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/artifacts/ioc-detect.ts apps/backend/src/artifacts/wazuh-parser.ts apps/backend/src/artifacts/resolvers.ts
git commit -m "feat(ca): bulk paste IOC + Wazuh alert import fast paths"
```

---

## Task 11: Auto-link implementations + final end-to-end verify

**Files:**
- Modify: `apps/backend/src/artifacts/repo.ts` — fill in the 4 link* function bodies stubbed in Task 6

- [ ] **Step 1: Implement link functions**

```typescript
export async function linkIocToGlobalIoc(artifactId: string, value: string): Promise<void> {
  // OPTIONAL MATCH (g:IOC {value: $value})
  // MATCH (a:Artifact:Ioc {id: $artifactId})
  // FOREACH (i IN CASE WHEN g IS NULL THEN [] ELSE [g] END | MERGE (a)-[:MATCHES_IOC]->(i))
}

export async function linkFileToHash(artifactId: string, sha256: string): Promise<void> {
  // similar — match (h:Hash {sha256: $sha256})
}

export async function linkProcessToTtp(artifactId: string, ttpIds: string[]): Promise<void> {
  // UNWIND $ttpIds AS tid
  // OPTIONAL MATCH (t:AttackPattern {id: tid})
  // MATCH (a:Artifact:Process {id: $artifactId})
  // FOREACH (x IN CASE WHEN t IS NULL THEN [] ELSE [t] END | MERGE (a)-[:MATCHES_TTP]->(x))
}

export async function linkDetectionHitToRule(artifactId: string, ruleId: string): Promise<void> {
  // OPTIONAL MATCH (r:DetectionRule {id: $ruleId})
  // MATCH (a:Artifact:DetectionHit {id: $artifactId})
  // FOREACH (...) MERGE :MATCHES_RULE
}
```

> All link* functions are best-effort — if the global node doesn't exist, no edge is created. No throw. This matches the SBOM linking pattern used in `apps/backend/src/assets/sbom-ingest.ts`.

- [ ] **Step 2: Verify auto-link works**

In Cypher:
```cypher
MATCH (a:Artifact:Ioc)-[:MATCHES_IOC]->(g:IOC) RETURN a.value, g.value;
```
Expected: matches when artifact value matches existing global IOC. May be 0 if no global IOC nodes exist yet.

```cypher
MATCH (a:Artifact:Process)-[:MATCHES_TTP]->(t:AttackPattern)
RETURN a.name, t.id, t.name;
```
Expected: artifacts with `ttpHints: ["T1059.001"]` linked to AttackPattern T1059.001 (if MITRE ingest has run).

- [ ] **Step 3: End-to-end verify**

Verify the full Case lifecycle:

```graphql
mutation { updateCase(id: "<caseId>", input: { status: ACTIVE }) { status } }
```

```graphql
query { case(id: "<caseId>") {
  reportNo status verdict
  stakeholder { name }
  artifactCount
  artifactsByType { ioc file process network registry persistence account logFinding memory detectionHit note }
  findings(limit: 6) { id type severity }
  timeline(limit: 20) { id type observedAt }
} }
```
Expected: artifactCount = sum of all type counts; findings only HIGH/CRITICAL + HIGH-confidence; timeline ordered by observedAt asc.

```graphql
mutation { closeCase(id: "<caseId>", verdict: CONFIRMED) { status verdict closedAt } }
```
Expected: status CLOSED, verdict CONFIRMED, closedAt set.

```graphql
mutation { createIocArtifact(caseId: "<caseId>", input: { base: { observedAt: "2026-04-23T15:00:00Z", severity: LOW, confidence: LOW }, iocType: IP, value: "9.9.9.9" }) { id } }
```
Expected: error — case is CLOSED, can't add artifact (per Task 6 lifecycle guard).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/artifacts/repo.ts
git commit -m "feat(ca): implement auto-link from artifact to global IOC/Hash/TTP/Rule"
```

---

## Self-Review Checklist (post-write)

**Spec coverage:**
- [x] Case schema (m013) → Task 1
- [x] Case lifecycle (DRAFT/ACTIVE/CLOSED/ARCHIVED) + verdict → Tasks 2-4
- [x] 11 typed Artifacts (multi-label) → Tasks 1, 5, 7-9
- [x] Shared fields per artifact (observedAt, host, severity, confidence, notes, tags) → Task 5 (interface) + Task 6 (createArtifactNode)
- [x] Bulk paste IOC → Task 10
- [x] Wazuh alert import → Task 10
- [x] Auto-link to existing IOC/Hash/Tactic/Technique/DetectionRule → Tasks 7-9 (call sites) + Task 11 (impls)
- [x] Findings (high-conf + high-sev subset) → Task 6 + Task 4 resolver
- [x] Timeline (chronological) → Task 6 + Task 4 resolver

**Out-of-scope acknowledged:**
- UI for `/cases` and detail page → separate plan
- Templates + recently-used host → post-MVP
- Audit log entries → would land in `apps/backend/src/audits/`; not built in this plan
- Case attachments (PDF/screenshots) → object storage out of scope
- Cross-case IOC linking query → emerges from `:MATCHES_IOC` for free

**Type consistency:**
- `tenantId: string` on all repo signatures
- `caseId: string` parameter consistent
- TYPE_TO_LABEL / LABEL_TO_GQL_TYPE maps cover all 11 types — verified
- Severity enum (`INFO|LOW|MEDIUM|HIGH|CRITICAL`) consistent between TS, GraphQL, and Wazuh severity mapping
- Confidence enum (`LOW|MEDIUM|HIGH`) consistent

**No placeholders verified.** Tasks 7-9 use a "same template" pattern for repetitive per-type creates — this is acceptable because Task 7 shows the full template explicitly; Tasks 8-9 reference it without ambiguity.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-helyx-ca-case-backend.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because each task is self-contained and reviewable independently.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Sequencing:** Plan A (master-data) MUST complete first (Stakeholder is required for Case). After Plan A's Task 13 verifies, start Plan B's Task 1.

**Which approach?**
