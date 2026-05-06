# Compromise Assessment (CA) — Case + Per-Artifact Spec

Spec untuk module CA di Helyx. Operator (admin/analyst) lapangan sehari-hari pakai. Landing-page consume metadata-nya sebagai showcase spotlight.

## Konteks dari owner

> "ga jadi 1 form, jadi artefact sendiri apa sendiri gitu"

Workflow CA bukan satu form besar. Saat tim turun ke stakeholder, mereka **collect artifact secara incremental** — log, file, IOC, persistence finding, dst. Tiap artifact punya struktur data berbeda (file punya hash + path; network punya src/dst/port). Form tunggal yang muat semua = kejam.

Solusi: **Case** sebagai container, dengan **typed Artifact nodes** yang masing-masing punya form sendiri. Operator menambah artifact one-at-a-time saat investigasi jalan.

## Domain model

```
              (:Stakeholder)
                    │
                    │  [:ASSESSED_IN]
                    ▼
              (:Case)
                ├──[:ASSESSED]──> (:Stakeholder)
                ├──[:ON_ASSET]──> (:Asset)*       (host yang di-scan)
                ├──[:HAS_ARTIFACT]──> (:Artifact:<TypeLabel>)
                ├──[:LED_BY]──> (:User)            (case lead)
                ├──[:PARTICIPATED]──> (:User)*    (team members)
                └──[:HAS_VERDICT]──> (:Verdict {value, decidedAt, decidedBy})

(:Artifact:Ioc)
(:Artifact:File)
(:Artifact:Process)
(:Artifact:Network)
(:Artifact:Registry)
(:Artifact:Persistence)
(:Artifact:Account)
(:Artifact:LogFinding)
(:Artifact:Memory)
(:Artifact:DetectionHit)
(:Artifact:Note)

Each Artifact node:
  - inherits :Artifact (untuk query lintas-tipe)
  - plus type label (untuk type-specific fields)
  - properties shared: id, caseId, observedAt, host (Asset id), confidence, severity, addedBy, addedAt, notes
  - properties type-specific (lihat per-tipe di bawah)
  - opsional edge ke entitas Helyx existing:
      (:Artifact:Ioc)-[:MATCHES_IOC]->(:IOC)
      (:Artifact:File)-[:MATCHES_HASH]->(:Hash)
      (:Artifact:DetectionHit)-[:MATCHES_RULE]->(:DetectionRule)
      (:Artifact:Process)-[:MATCHES_TTP]->(:Tactic|Technique)
```

Kenapa **multi-label** (`:Artifact:Ioc`) bukan property `type`:
- Cypher pattern matching jadi lebih cepat (`MATCH (a:Ioc)` vs `MATCH (a:Artifact {type:"ioc"})`)
- Index per-type lebih efisien
- Schema-as-graph lebih jelas saat browse Neo4j

## Case lifecycle

```
   draft  →  active  →  closed
                   ↘
                    archived  (after retention)
```

- `draft`: sedang disiapkan, tim belum turun. Limited fields filled.
- `active`: tim on-site, artifact sedang dikumpulkan.
- `closed`: investigasi selesai, verdict di-set. No more artifact additions.
- `archived`: 90+ hari setelah closed, hidden from default view (still queryable for audit).

Verdict (set saat transition `active → closed`):
- `confirmed` — compromise confirmed
- `inconclusive` — bukti tidak cukup
- `clean` — tidak ada compromise
- `pending` (selama active) — belum decide

## Schema additions (Cypher)

```cypher
CREATE CONSTRAINT case_id_unique IF NOT EXISTS
FOR (c:Case) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT case_report_no_unique IF NOT EXISTS
FOR (c:Case) REQUIRE c.reportNo IS UNIQUE;

CREATE INDEX case_status IF NOT EXISTS
FOR (c:Case) ON (c.status);

CREATE INDEX case_deployed_at IF NOT EXISTS
FOR (c:Case) ON (c.deployedAt);

CREATE FULLTEXT INDEX case_search IF NOT EXISTS
FOR (c:Case) ON EACH [c.reportNo, c.title, c.trigger, c.summary];

CREATE CONSTRAINT artifact_id_unique IF NOT EXISTS
FOR (a:Artifact) REQUIRE a.id IS UNIQUE;

CREATE INDEX artifact_case IF NOT EXISTS
FOR (a:Artifact) ON (a.caseId);

CREATE INDEX artifact_observed_at IF NOT EXISTS
FOR (a:Artifact) ON (a.observedAt);
```

Per-type indexes (selectif):

```cypher
CREATE INDEX artifact_ioc_value IF NOT EXISTS
FOR (a:Ioc) ON (a.value);

CREATE INDEX artifact_file_sha256 IF NOT EXISTS
FOR (a:File) ON (a.sha256);

CREATE INDEX artifact_process_name IF NOT EXISTS
FOR (a:Process) ON (a.name);
```

## Artifact catalogue (11 tipe)

Setiap tipe = 1 form. Operator pilih tipe → buka form khusus → submit → artifact muncul di tab tipenya di Case detail.

### Shared fields (di semua tipe)

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| observedAt | datetime | ✓ | kapan artifact ditemukan/diobservasi |
| host | Asset.id (ref) | – | host tempat artifact ditemukan (link ke asset graph) |
| severity | enum (info/low/med/high/crit) | ✓ | per-artifact severity (boleh beda dari case verdict) |
| confidence | enum (low/med/high) | ✓ | seberapa yakin artifact ini relevan |
| notes | text | – | freeform |
| tags | string[] | – | freeform tag |

### 1. IOC (`:Artifact:Ioc`)

Fields tipe-spesifik:

| Field | Type | Wajib |
|---|---|---|
| iocType | enum (ip / domain / url / email / hash) | ✓ |
| value | string | ✓ |
| direction | enum (inbound / outbound / both) | – |
| firstSeen | datetime | – |
| lastSeen | datetime | – |
| source | string | – | "manual" / "vt" / "elk_alert" |

Bulk paste support: tempel list IP/domain → auto-create N IOC artifacts.

Auto-link: kalau `value` cocok existing `(:IOC)` di Helyx, edge `:MATCHES_IOC`.

### 2. File (`:Artifact:File`)

| Field | Type | Wajib |
|---|---|---|
| filename | string | ✓ |
| filepath | string | – |
| md5 | string | – |
| sha1 | string | – |
| sha256 | string | recommended |
| sizeBytes | int | – |
| mime | string | – |
| signed | bool | – |
| signer | string | – |
| behavior | enum[] (dropper / loader / stealer / ransomware / livingofftheland / other) | – |

Auto-link existing `(:Hash)` node by sha256.

### 3. Process (`:Artifact:Process`)

| Field | Type | Wajib |
|---|---|---|
| name | string | ✓ |
| pid | int | – |
| commandLine | text | – |
| parentName | string | – |
| user | string | – |
| startedAt | datetime | – |
| ttpHints | string[] | – | "T1059.001 PowerShell" dst |

Auto-link `:Tactic` / `:Technique` jika `ttpHints` cocok MITRE ID.

### 4. Network (`:Artifact:Network`)

| Field | Type | Wajib |
|---|---|---|
| protocol | enum (tcp / udp / icmp / http / dns) | ✓ |
| srcIp | string | ✓ |
| srcPort | int | – |
| dstIp | string | ✓ |
| dstPort | int | – |
| direction | enum (inbound / outbound / lateral) | – |
| bytes | int | – |
| connectionStartedAt | datetime | – |

### 5. Registry (`:Artifact:Registry`) — Windows only

| Field | Type | Wajib |
|---|---|---|
| hive | enum (HKLM / HKCU / HKCR / HKU / HKCC) | ✓ |
| keyPath | string | ✓ |
| valueName | string | – |
| valueData | text | – |
| action | enum (created / modified / deleted) | ✓ |

### 6. Persistence (`:Artifact:Persistence`)

| Field | Type | Wajib |
|---|---|---|
| mechanism | enum (scheduled_task / service / startup_folder / run_key / wmi / cron / systemd / launchd / other) | ✓ |
| name | string | ✓ |
| target | string | – | path/script yang dijalankan |
| user | string | – |
| createdAt | datetime | – |

### 7. Account (`:Artifact:Account`)

| Field | Type | Wajib |
|---|---|---|
| username | string | ✓ |
| domain | string | – |
| action | enum (created / privilege_escalated / disabled / password_changed / login_anomaly) | ✓ |
| privileges | string[] | – |
| sourceIp | string | – | IP asal aktivitas |

### 8. Log Finding (`:Artifact:LogFinding`)

| Field | Type | Wajib |
|---|---|---|
| logSource | string | ✓ | "Sysmon" / "Windows Security" / "Wazuh alert" / "Linux auditd" |
| eventId | string | – |
| timestamp | datetime | ✓ |
| rawLine | text | – |
| observation | text | ✓ | apa yang investigator lihat |

### 9. Memory (`:Artifact:Memory`)

| Field | Type | Wajib |
|---|---|---|
| processName | string | ✓ |
| pid | int | – |
| finding | enum (process_injection / hollowing / shellcode / unbacked_memory / strings_match / other) | ✓ |
| evidence | text | – |
| toolUsed | string | – | "Volatility" / "WinDbg" / "Sysmon" |

### 10. Detection Hit (`:Artifact:DetectionHit`)

| Field | Type | Wajib |
|---|---|---|
| ruleSource | enum (sigma / yara / wazuh / elastic / custom) | ✓ |
| ruleId | string | ✓ |
| ruleName | string | ✓ |
| firedAt | datetime | ✓ |
| count | int | – |

Auto-link existing `(:DetectionRule)` jika ada match by ruleId.

### 11. Note (`:Artifact:Note`)

Free-form catatan investigator.

| Field | Type | Wajib |
|---|---|---|
| title | string | – |
| body | markdown text | ✓ |
| author | User.id | ✓ |

## UI flow (Helyx web — `/cases`)

### Case list

`/cases` — table dengan filter status / sektor / lead / verdict / date range. Default sort: status asc, deployedAt desc.

Columns: `reportNo`, `stakeholder`, `city`, `lead`, `status`, `verdict`, `artifactCount`, `deployedAt`.

### Case detail (`/cases/:id`)

Layout:

```
┌──────────────────────────────────────────────────────────────┐
│  005/CA/CTH/05/2026                          [Edit] [Close]  │
│  Diskomlek TNI AL — Surabaya                                 │
│  Active · Pending verdict · Lead: A. Wibowo · Team: Alpha    │
│  Trigger: Indikasi exfiltration pada gateway strategic comms │
├──────────────────────────────────────────────────────────────┤
│ ▍Summary  ▍Findings (4)  ▍Timeline                           │
├──────────────────────────────────────────────────────────────┤
│  [+ Add Artifact]   [Bulk paste IOC]   [Import Wazuh alert]  │
├──────────────────────────────────────────────────────────────┤
│  IOC (8)  File (3)  Process (5)  Network (2)  Registry (-)   │
│  Persistence (1)  Account (-)  Log (4)  Memory (-)           │
│  Detection Hit (2)  Note (3)                                 │
├──────────────────────────────────────────────────────────────┤
│  [Selected tab content — table of artifacts of that type]    │
│   - row click expands inline detail                          │
│   - row right-click: Edit / Duplicate / Delete               │
└──────────────────────────────────────────────────────────────┘
```

Tab counts update live as artifacts added.

### Add Artifact flow

Click `[+ Add Artifact]` → dropdown picker (atau modal):

```
Pick artifact type:
  1. IOC               (i)
  2. File              (f)
  3. Process           (p)
  4. Network           (n)
  5. Registry          (r)
  6. Persistence       (e)
  7. Account           (a)
  8. Log Finding       (l)
  9. Memory            (m)
  0. Detection Hit     (d)
  .  Note              (.)
```

Keyboard letter pick atau number. Recently-used types pinned di atas.

→ Buka type-specific form (slide-in panel dari kanan, bukan navigasi page) → fill → Save.

Form auto-save draft per 5 detik di localStorage (fallback kalau browser crash).

### Speed optimizations

- **Keyboard**: `n` open Add Artifact picker; type letter; tab thru fields; cmd+enter save; esc close.
- **Bulk paste IOC**: tempel list multi-line → 1 IOC artifact per row, auto-detect type (ip/domain/hash) by regex.
- **Wazuh alert import**: paste raw alert JSON → auto-fill DetectionHit + LogFinding skeleton.
- **Recently used host**: dropdown host (Asset) ingat 5 host terakhir di case ini.
- **Duplicate artifact**: clone existing artifact, edit beberapa field, save.
- **Templates**: simpan artifact yang sering muncul (e.g. "common Mimikatz hash") sebagai template re-usable.

### Findings view (across-tab summary)

Tab `Findings` di Case detail = read-only ringkasan high-severity / high-confidence artifacts dari semua tipe, sorted by severity. Berguna untuk handoff atau dipakai Landing showcase.

### Timeline view

Tab `Timeline` = chronological feed all artifacts dengan `observedAt`. Visual seperti git commit timeline. Berguna untuk reconstruct attack chain.

## GraphQL surface

```graphql
type Case {
  id: ID!
  reportNo: String!
  title: String
  trigger: String
  summary: String
  status: CaseStatus!
  verdict: CaseVerdict
  deployedAt: Date!
  closedAt: Date
  stakeholder: Stakeholder!
  lead: User
  team: [User!]!
  assets: [Asset!]!
  artifactCount: Int!
  artifactsByType: ArtifactCounts!
  artifacts(type: ArtifactType, severity: Severity, limit: Int, offset: Int): [Artifact!]!
  findings: [Artifact!]!  # high-confidence + high-severity subset
  timeline: [Artifact!]!  # sorted by observedAt
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

interface Artifact {
  id: ID!
  caseId: ID!
  type: ArtifactType!
  observedAt: DateTime!
  host: Asset
  severity: Severity!
  confidence: Confidence!
  notes: String
  tags: [String!]!
  addedBy: User!
  addedAt: DateTime!
}

type IocArtifact implements Artifact {
  ...shared
  iocType: IocType!
  value: String!
  direction: Direction
  firstSeen: DateTime
  lastSeen: DateTime
  source: String
  matchedIoc: IOC  # link to existing Helyx IOC node
}

type FileArtifact implements Artifact { ...file fields }
type ProcessArtifact implements Artifact { ... }
type NetworkArtifact implements Artifact { ... }
... (10 more types)

enum ArtifactType { IOC FILE PROCESS NETWORK REGISTRY PERSISTENCE ACCOUNT LOG_FINDING MEMORY DETECTION_HIT NOTE }
enum CaseStatus { DRAFT ACTIVE CLOSED ARCHIVED }
enum CaseVerdict { CONFIRMED INCONCLUSIVE CLEAN PENDING }
```

Mutations per type:
- `createIocArtifact(caseId, input)` ... and so on, per type
- Plus generic `bulkCreateIocArtifacts(caseId, values: [String!]!)` untuk paste flow
- `updateArtifact(id, input)`, `deleteArtifact(id)`
- Case ops: `createCase`, `updateCase`, `closeCase(id, verdict)`, `archiveCase(id)`

## What Landing-page consumes (read-only)

Landing showcase tidak butuh artifact detail. Ia butuh metadata:

```graphql
query LandingCaseList {
  cases(status: [ACTIVE, CLOSED], first: 20) {
    nodes {
      reportNo
      stakeholder { name city coords }
      status
      verdict
      deployedAt
      artifactCount
      trigger
      # short summary (first 200 chars), bukan full findings
    }
  }
}
```

Findings detail untuk Landing's spotlight view: limit ke top 4-6 high-impact findings as plaintext bullet list (untuk visual).

```graphql
query LandingCaseSpotlight($id: ID!) {
  case(id: $id) {
    reportNo
    stakeholder { name city coords }
    trigger
    summary
    verdict
    findings(limit: 6) { 
      severity
      ... on IocArtifact { value iocType }
      ... on FileArtifact { filename behavior }
      ... on ProcessArtifact { name commandLine }
      ... on NetworkArtifact { srcIp dstIp dstPort }
      ... on DetectionHitArtifact { ruleName }
      # other types projected as short string
    }
  }
}
```

Landing **tidak** akses raw artifact tables, audit log, atau team list.

## Migration plan

1. **m011_master_data_schema.ts** (lihat master-data-spec) — Stakeholder + Sektor harus ada dulu (Case relasi).
2. **m012_seed_sektor.ts** — sektor canonical.
3. **m013_ca_case_schema.ts** — Case + Artifact constraints/indexes.
4. **GraphQL schema + resolver** untuk Case + per-type Artifact.
5. **Helyx web `/cases`** UI — list page → detail page → tab per type → forms slide-in.
6. **Bulk paste IOC** + **Wazuh alert import** sebagai fast-path.
7. Templates + recently-used host setelah core stabil.

## Open questions

1. Multi-host case — case 1 stakeholder bisa multi host? Iya, edge `:ON_ASSET` boleh multi. Per-artifact host link ke specific asset.
2. Case attachments (PDF report final, screenshot evidence) — tidak masuk graph, simpan di object storage, reference URL di Case property `attachments`. Out of scope migrasi pertama.
3. Cross-case linking — sometimes IOC sama muncul di multiple cases. Dengan auto-link ke `:IOC` global, query `MATCH (i:IOC {value:"X"})<-[:MATCHES_IOC]-(:Ioc)<-[:HAS_ARTIFACT]-(c:Case)` kasih lihat semua case yang sentuh IOC itu.
4. Audit trail per artifact edit — sudah include via `apps/backend/src/audits/`. Field tambahan: `action: "artifact.create" | "artifact.update" | "artifact.delete"`.
