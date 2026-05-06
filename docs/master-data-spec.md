# Master Data — Stakeholder / Sektor / Sensor

Spec untuk extension Helyx graph dengan master data stakeholder yang dipantau (kementerian, TNI, BUMN, dll). Konsumer utama: Helyx web admin UI + landing-page executive dashboards.

## Goal

Single source of truth untuk:
- **Sektor** — taxonomy bisnis (~19 sektor existing dari ELK).
- **Stakeholder** — entitas konkret yang dipantau (~853 organisasi mentah dari ELK).
- **Sensor deployment** — stack monitoring yang dipasang per stakeholder (Wazuh / ELK / Mixed / Agent-only).

Sumber bootstrap: ELK index `nasional_cve_new-*` (fields `Sektor`, `Subsektor`, `Organisasi`, `Target`).

## Naming — kenapa `Stakeholder` bukan `Organization`

Helyx sudah punya `:Organization` (di `m003_tenant_schema.ts`) untuk **tenant multi-org Helyx itu sendiri** (yaitu CTH, BSSN, dst sebagai user Helyx). Pakai nama `:Stakeholder` untuk **entitas yang dipantau** supaya tidak clash.

Kalau nanti `:Organization` mau di-rename ke `:Tenant`, itu refactor terpisah — di luar scope master data ini.

## Schema additions (Cypher)

### Sektor

```cypher
CREATE CONSTRAINT sektor_id_unique IF NOT EXISTS
FOR (s:Sektor) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT sektor_slug_unique IF NOT EXISTS
FOR (s:Sektor) REQUIRE s.slug IS UNIQUE;

CREATE INDEX sektor_name IF NOT EXISTS
FOR (s:Sektor) ON (s.name);
```

Properties: `id` (uuid), `slug` (kebab), `name` (display), `displayOrder` (int), `createdAt`, `updatedAt`.

Sektor canonical (bootstrap dari ELK distinct values, last 3 months, sorted by doc count):

| slug | name | catatan |
|---|---|---|
| administrasi-pemerintahan | Administrasi Pemerintahan | satu-satunya yang punya subsektor konsisten di ELK |
| esdm | ESDM | label di ELK keliru (seharusnya subsektor Energi) — keep apa adanya, admin clean later |
| pendidikan | Pendidikan | drop prefix "Lainnya" |
| transportasi | Transportasi | |
| keuangan | Keuangan | |
| pertahanan | Pertahanan | |
| pariwisata | Pariwisata | drop "Lainnya" |
| tik | TIK | |
| kesehatan | Kesehatan | |
| energi | Energi | |
| perdagangan | Perdagangan | drop "Lainnya" |
| pangan | Pangan | |
| industri | Industri | drop "Lainnya" |
| logistik | Logistik | drop "Lainnya" |
| ormas | Ormas | drop "Lainnya" |
| media | Media | drop "Lainnya" |
| perseorangan | Perseorangan | drop "Lainnya" |

Sektor `Nan` di-skip (78 docs, 3 orgs — noise).

Subsektor **tidak diwajibkan** (per keputusan owner). Kalau nanti perlu, tambah `:Subsektor` node + `(:Subsektor)-[:OF_SEKTOR]->(:Sektor)`.

### Stakeholder

```cypher
CREATE CONSTRAINT stakeholder_id_unique IF NOT EXISTS
FOR (k:Stakeholder) REQUIRE k.id IS UNIQUE;

CREATE CONSTRAINT stakeholder_slug_unique IF NOT EXISTS
FOR (k:Stakeholder) REQUIRE k.slug IS UNIQUE;

CREATE INDEX stakeholder_name IF NOT EXISTS
FOR (k:Stakeholder) ON (k.name);

CREATE FULLTEXT INDEX stakeholder_search IF NOT EXISTS
FOR (k:Stakeholder) ON EACH [k.name, k.aliases];
```

Properties:
- `id` (uuid), `slug` (kebab), `name` (display, e.g. "Kementerian Energi dan Sumber Daya Mineral")
- `aliases` (string list — variasi nama yang muncul di ELK)
- `coords` ([lon, lat] — untuk ditandain di peta landing-page)
- `city` (display label)
- `notes` (admin notes)
- `status` ("active" | "archived")
- `createdAt`, `updatedAt`

Edge: `(:Stakeholder)-[:IN_SEKTOR]->(:Sektor)` (1 stakeholder bisa di 1 sektor primary; kalau perlu multi, tambah `[:IN_SEKTOR_SECONDARY]`).

Edge ke Asset (sudah ada di Helyx):
`(:Stakeholder)-[:OWNS]->(:Asset)` — stakeholder owns assets that Helyx tracks.

### Reconciliation (raw ELK → master)

ELK punya ~853 organisasi mentah (banyak typo, casing variasi, duplikasi). Reconciliation node menyimpan label mentah + status approval.

```cypher
CREATE CONSTRAINT raw_org_key_unique IF NOT EXISTS
FOR (r:RawStakeholder) REQUIRE (r.source, r.normalizedKey) IS UNIQUE;

CREATE INDEX raw_org_status IF NOT EXISTS
FOR (r:RawStakeholder) ON (r.status);
```

Properties:
- `source` ("ELK" untuk sekarang, future: "BSSN", "BIN", dst)
- `rawName` (label mentah persis dari ELK, e.g. "Kementerian Energi Dan Sumber Daya Mineral")
- `normalizedKey` (lowercased, stripped, dedup key)
- `rawSektor` (label sektor di ELK)
- `targetCount`, `hitCount`, `lastSeen` (statistik untuk prioritas reconciliation)
- `status` ("pending" | "approved" | "rejected" | "needs_review")
- `confidence` (suggestion match score, kalau auto-suggested)
- `resolvedBy` (user id, kalau approved)
- `resolvedAt`

Edge:
- `(:RawStakeholder)-[:RESOLVED_TO]->(:Stakeholder)` (set after admin approves)
- Optional: `(:RawStakeholder)-[:SUGGESTED]->(:Stakeholder)` untuk top-3 fuzzy candidates (cached untuk render cepat)

### Sensor deployment

Untuk sekarang attribute saja di Stakeholder (status manual flag, ga ada history). Kalau nanti perlu history (upgrade timeline, downtime events), promote ke node terpisah.

```cypher
// Properties on Stakeholder:
//   sensorStack: "wazuh-full" | "elk-full" | "wazuh-agent" | "mixed" | null
//   sensorStatus: "online" | "degraded" | "offline" | null
//   sensorAgentCount: int | null
//   sensorDeployedAt: date | null
//   sensorNotes: string | null
```

Kalau later butuh node:

```cypher
CREATE CONSTRAINT sensor_deployment_id_unique IF NOT EXISTS
FOR (d:SensorDeployment) REQUIRE d.id IS UNIQUE;
```

Edge: `(:Stakeholder)-[:HAS_SENSOR_DEPLOYMENT]->(:SensorDeployment)`.

## Migration strategy

1. **m011_master_data_schema.ts** — buat constraints + indexes (Sektor, Stakeholder, RawStakeholder).
2. **m012_seed_sektor.ts** — seed 17 sektor canonical.
3. **bootstrap CLI**: `pnpm --filter @helyx/backend bootstrap:stakeholders` — pull distinct (Sektor, Organisasi, Target) tuples from ELK 6 bulan terakhir, materialize jadi `RawStakeholder` nodes dengan status `pending`.
4. **Reconciliation UI** di Helyx web (lihat di bawah) — admin kerjakan inbox.
5. Asset linking: existing `:Asset` nodes di-link ke `:Stakeholder` via Target match (domain → stakeholder owner), bisa pakai bulk update query setelah master clean.

## Reconciliation workflow (Helyx web — `/admin/stakeholders/inbox`)

Tujuan: admin clean ~853 entries cepat. Optimized for keyboard + bulk.

### Ranking pending entries

Default sort: by `hitCount DESC, lastSeen DESC` (clean yang paling impactful dulu).

### Per-row layout

```
┌────────────────────────────────────────────────────────────┐
│ 412 pending · 441 approved                          [↑↓ JK]│
├────────────────────────────────────────────────────────────┤
│  Kementerian Energi Dan Sumber Daya Mineral               │
│  Sektor (ELK): Esdm                                        │
│  Hits: 12,034 · Targets: 24 · Last seen: 2 hari lalu      │
│                                                            │
│  Suggestions (fuzzy):                                      │
│  [1] Kementerian ESDM                            92%   ✓   │
│  [2] Kementerian Energi & Sumber Daya Mineral    87%       │
│  [3] PT PLN (Persero)                            34%       │
│                                                            │
│  Actions:                                                  │
│   1/2/3  → approve dengan suggestion                       │
│   N      → create Stakeholder baru                         │
│   M      → merge with...                                   │
│   S      → skip / mark needs_review                        │
│   X      → reject (noise / not a real org)                 │
│   B      → bulk: apply suggestion 1 to all dengan          │
│            normalizedKey similar (≥ threshold)             │
└────────────────────────────────────────────────────────────┘
```

Tombol mouse tetap ada, tapi default flow keyboard-first.

### Fuzzy suggestion sources (urutan priority)

1. **Exact alias match** — kalau ada Stakeholder yang `aliases` array-nya sudah include `rawName`, instant 100%.
2. **Levenshtein distance** ≤ 4 dari `name` atau salah satu `aliases`.
3. **Domain mapping** — kalau `Target` di-records ELK ada (e.g. `esdm.go.id`), map ke Stakeholder yang sudah owns Asset dengan domain itu.
4. **Acronym match** — "K-ESDM" → "Kementerian ESDM" via initials.
5. **Common prefix/suffix patterns** — "Pemerintah Kabupaten/Kota X" → kandidat Pemkab/Pemkot X.

Top-3 di-cache di `(:RawStakeholder)-[:SUGGESTED]->(:Stakeholder)` edge untuk render <50ms.

### Bulk operations

- **Pattern selector**: regex on rawName → preview list → apply suggestion 1 to all
  Contoh: `^Pemerintah Kabupaten` → bulk approve dengan template "create Stakeholder Pemkab {N}"
- **Merge mode**: select 2+ pending rows yang merujuk entitas sama → resolve all to single Stakeholder.

### Speed metrics (target)

- Median per-row resolve time < 5 detik (admin yang familiar data).
- Bulk pattern: 1 keystroke handle 20-50 rows sekaligus.
- 412 pending → realistic 1-2 jam admin sprint untuk clean batch awal.

### Audit

Semua resolve action append ke existing audit log (lihat `apps/backend/src/audits/`). Field tambahan:
- `action`: "stakeholder.resolve" | "stakeholder.create" | "stakeholder.reject" | "stakeholder.bulk_resolve"
- `before` / `after` payload
- `count` untuk bulk ops

## GraphQL surface (sketch)

Type:

```graphql
type Sektor {
  id: ID!
  slug: String!
  name: String!
  stakeholderCount: Int!
  stakeholders(first: Int = 50, after: String): StakeholderConnection!
}

type Stakeholder {
  id: ID!
  slug: String!
  name: String!
  aliases: [String!]!
  city: String
  coords: [Float!]
  sektor: Sektor
  sensor: SensorDeploymentSummary
  assetCount: Int!
  caseCount(status: CaseStatus): Int!
  status: StakeholderStatus!
}

type SensorDeploymentSummary {
  stack: SensorStack
  status: SensorStatus
  agentCount: Int
  deployedAt: Date
  notes: String
}

enum SensorStack { WAZUH_FULL ELK_FULL WAZUH_AGENT MIXED }
enum SensorStatus { ONLINE DEGRADED OFFLINE }

type RawStakeholder {
  id: ID!
  source: String!
  rawName: String!
  rawSektor: String
  hitCount: Int!
  targetCount: Int!
  lastSeen: Date!
  status: ReconciliationStatus!
  suggestions: [StakeholderSuggestion!]!
}

type StakeholderSuggestion {
  stakeholder: Stakeholder!
  confidence: Float!
  reason: String!  # "alias-match" | "levenshtein" | "domain-match" | ...
}

enum ReconciliationStatus { PENDING APPROVED REJECTED NEEDS_REVIEW }
```

Mutations:
- `createStakeholder(input)`, `updateStakeholder(id, input)`, `archiveStakeholder(id)`
- `createSektor(input)`, `updateSektor(id, input)`
- `resolveRawStakeholder(rawId, stakeholderId)` — single approve
- `bulkResolveRawStakeholders(rawIds, stakeholderId)` — bulk
- `createStakeholderFromRaw(rawId, input)` — combined create + resolve
- `rejectRawStakeholder(rawId, reason)`
- `recomputeSuggestions(rawId?)` — re-run fuzzy match (after master changes)

## Open questions

1. Sektor untuk Stakeholder yang lintas-sektor (e.g. PT Telkom = TIK + BUMN)? Sekarang single sektor. Kalau perlu multi, tambah `IN_SEKTOR_SECONDARY` edge.
2. Apa BUMN/swasta perlu jadi atribut Stakeholder (`ownership: "GOV" | "BUMN" | "PRIVATE"`)? Berguna untuk filter showcase.
3. Kapan `:RawStakeholder` di-archive? Setelah resolved + 90 hari kalau ELK ga lagi melaporkan label itu? Kebijakan retention belum diputuskan.
