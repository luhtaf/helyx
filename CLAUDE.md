# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Helyx

Graph-native threat-intel platform. First vertical = vulnerability + exposure management. The original product brief lives in `command.MD` (Bahasa Indonesia) — read it before any architectural decision; this file only summarises the load-bearing parts.

## Repo layout

pnpm workspace monorepo:
- `apps/backend` — Apollo Server 4 (GraphQL) + Neo4j driver, ESM TypeScript.
- `apps/web` — Vue 3 + Vite + TypeScript + Tailwind + Apollo Client.
- `docker-compose.yml` — local Neo4j 5 (community + APOC).

## Commands

```
corepack enable                # one-time, enables pnpm
pnpm install                   # installs all workspaces
pnpm db:up                     # docker compose up -d neo4j redis
pnpm db:down
pnpm db:logs
pnpm dev                       # runs backend + web in parallel (pnpm -r --parallel dev)
pnpm --filter @helyx/backend dev
pnpm --filter @helyx/web dev
pnpm --filter @helyx/backend typecheck
pnpm --filter @helyx/backend migrate          # apply pending Neo4j migrations
pnpm --filter @helyx/backend migrate:status   # list migrations + live constraints/indexes
pnpm --filter @helyx/backend nvd:sync                       # incremental from last sync state (or last 7d)
pnpm --filter @helyx/backend nvd:sync -- --fallback-days 1  # default-since override
pnpm --filter @helyx/backend nvd:sync -- --since 2026-01-01T00:00:00Z --until 2026-02-01T00:00:00Z
pnpm --filter @helyx/backend elk:sync                       # bulk CVE pull from owner's ELK (resumes from cursor)
pnpm --filter @helyx/backend elk:sync -- --reset            # ignore saved cursor, restart from scratch
pnpm --filter @helyx/backend elk:sync -- --max-batches 5 --page-size 200  # bounded test run
pnpm -r build
```

Backend listens on `:4000/graphql`. Web dev server on `:5173` proxies `/graphql` → backend. Neo4j browser on `:7474`, bolt on `:7687`. Set `NEO4J_PASSWORD` in your local `.env` (any value — `docker-compose.yml` interpolates it; if you change after first init you must `docker compose down -v` to recreate the volume since Neo4j sticks the password on first boot). `JWT_SECRET` (≥32 chars) is required — generate with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.

There are **no tests yet** — owner deferred them. Do not add a test runner without asking.

## Communication

The owner writes and thinks in Bahasa Indonesia. Mirror that when discussing product/architecture; code identifiers stay English.

## Architectural intent (from `command.MD`)

The brief is detailed; these are the load-bearing decisions a future Claude must respect:

### Stack
- **Backend**: GraphQL.
- **Database**: Neo4j as the primary store. Everything is a graph — CVE, Product, Vendor, Asset, ThreatActor, TTP (MITRE), IOC, DetectionRule are nodes; relations are first-class edges. Do **not** introduce a relational DB for domain data without explicit approval.
- **Config**: `.env`-driven. OTX is one planned enrichment source; expect more (NVD, MITRE ATT&CK, vendor advisories).

### Asset model — tiered, not flat
Assets nest: physical host → hypervisor → VM → container/k8s pod → application → dependency. Every tier carries its own IPs and edges to the tier above/below. The graph must let users browse **tiered, list, or by-type** views without reshaping data — design queries/resolvers around traversal, not table joins.

Ingestion paths planned: Trivy `rootfs /` SBOM output, plus a generic SBOM ingest endpoint. A custom scanner is on the table if Trivy is insufficient — scanner targets include Proxmox, ESXi/vSphere, k3s/k0s/k8s, Docker. Treat scanner output as **untrusted input** (risk of injection through hostnames, package names, etc.).

### Schema lives in migrations
`apps/backend/src/migrations/` is the **single source of truth** for the Neo4j schema. Every constraint, index, and label change lands as a new `mNNN_*.ts` file appended to the list in `migrations/index.ts`. Each migration is a list of Cypher statements; statements use `IF NOT EXISTS` so partial re-runs are safe. The runner records applied migrations in `(:_Migration {id})`.

Do **not** create constraints/indexes ad-hoc from resolvers or seed scripts — always go through a migration. Never edit a migration that has already been applied to any environment; write a new one.

Initial schema (`001_initial_schema`) covers the **shared global graph**: `Vendor`, `Product`, `CPE`, `CVE`, `CWE`, `Reference`. These are tenant-agnostic and read-only for tenants. Tenant-scoped labels (`Asset`, `Hunt`, custom rules, etc.) come in later migrations and must carry `tenantId`.

### Ingestion sources live under `src/sources/<source>/`
Each source owns: `client.ts` (HTTP, rate-limit, retry), `types.ts` (Zod-validated wire shapes — `.passthrough()` so NVD adding fields never breaks us), `mapper.ts` (wire → internal row arrays, with in-memory dedupe), `ingest.ts` (one `executeWrite` tx of `UNWIND $rows AS row MERGE …` per entity/edge — no N+1 ever), `sync.ts` (orchestration + windowing), `cli.ts` (entry).

Sync state lives at `(:_SyncState {source})`. The next run defaults `since` to the previous run's `lastModEndDate`, so missing a day is harmless — the next run catches up. Manual override: `--since` / `--until` (ISO 8601). Without state, falls back to `--fallback-days` (default 7). NVD's lastMod window is capped at 120 days; `splitWindow()` chunks longer ranges automatically.

NVD specifics: rate-limit auto-derived from `NVD_API_KEY` (650 ms with key, 6.5 s without). Retries 5× with exponential backoff on 429/5xx. Vendor/Product names default to the CPE slug — enrich from CPE Dictionary in a future source. AFFECTS edges use NVD's `matchCriteriaId` as identity so re-runs don't multiply edges and multiple version-range matches between the same CVE+CPE pair are preserved.

ELK source (`src/sources/elk/`) is the **bulk backfill path** — owner ships a complete CVE dataset in the `list-cve` index, `_source.original` carries the raw NVD CVE 2.0 shape per doc, so `mapBatch()` and `writeBatch()` are reused verbatim from `nvd/`. Pagination uses Elasticsearch PIT + `search_after` sorted by `[lastModified asc, id.keyword asc]` (sort by `_id` is disallowed in 8.x without enabling fielddata). Cursor is the JSON-encoded `sort` array of the last hit, persisted in `(:_SyncState {source:'elk-cve-bulk'}).cursor` so a killed run resumes via `--max-batches`/Ctrl-C cycles. Sync state key (`elk-cve-bulk`) is intentionally separate from `nvd-cve` — they overlap on the same CVE/CPE/Vendor/etc. nodes via idempotent MERGE.

### Asset graph & SBOM ingest (implemented)
Assets live under `src/assets/` with the same `repo/resolvers` split as tenants. Tree shape: `(:Asset)-[:CONTAINS]->(:Asset)`. `kind` enum: `HOST | HYPERVISOR | VM | CONTAINER | K8S_CLUSTER | K8S_NODE | K8S_POD | IMAGE | APPLICATION`. Multiple IPs as a `[String]` property (no `:IPAddress` node yet — refactor when subnet queries become a hot path).

SBOM ingest accepts CycloneDX 1.x JSON (`ingestSbom(assetId, sbomJson)`). Components dedupe per `(tenantId, purl)`. Components without a `purl` are silently skipped (counted in `skippedNoPurl`). SPDX is not yet supported.

CPE/Product linking from a SoftwareComponent is best-effort:
- Explicit `cpe` field in SBOM → `MATCHES_CPE` direct.
- `purl.name` (with hyphen/dot → underscore variants) matched against `Product.slug` → `OF_PRODUCT` (may link to many vendors' products with the same slug — e.g. "openssl"; security-favourable false-positives).
- Where Product matched and component has a `version` → look up `(CPE {vendor: p.vendorSlug, product: p.slug, version})` → also `MATCHES_CPE`.

Delete is a single-node `DETACH DELETE` — children are orphaned (CONTAINS edge dropped, child re-surfaces in `rootAssets`). Cascade is intentionally opt-in for the future.

### CVE matching modes (query-time only, no persisted match edges)
All four `cves(mode)` / `cveCount(mode)` modes share **one Cypher template** (`TENANT_CVE_BASE` in `cves/cypher.ts`): `Asset → SoftwareComponent → OF_PRODUCT → Product → HAS_CPE → CPE ← AFFECTS ← CVE`. Modes differ only in their `WHERE` clause on `cpe.version`:

- **EXACT** — `cpe.version = c.version` (string equality)
- **MAJOR_MINOR** — `cpe.version STARTS WITH ${major}.${minor}.` or `= ${major}.${minor}` (component `2.4.4` → matches `2.4.x`)
- **MAJOR** — `cpe.version STARTS WITH ${major}.` or `= ${major}` (component `2.4.4` → matches `2.x.x`)
- **BEAST** — no filter (any version of the matched product)

Owner's rule: **never persist match decisions as edges**. The legacy `MATCHES_CPE` edge type was removed in `m005_drop_matches_cpe`. New CPEs added later (NVD daily, ELK refresh) automatically participate in all four modes — no re-link needed. The only persisted bridge between a `SoftwareComponent` and the global graph is `(:OF_PRODUCT)`, which is metadata (purl name → product slug match), not a match decision.

Explicit CPE info from SBOM (`SoftwareComponent.cpeUri` property) is preserved for display only — it does not affect matching.

Both list and count dedupe by CVE; the list picks an arbitrary representative `componentPurl`/`cpeUri` per CVE via `head(collect(DISTINCT …))`. For lists, a single asset detail page is fine — listing CVEs across many assets in one query is N+1; add DataLoader before exposing such a query.

### Asset delete modes
`deleteAsset(id, mode)` defaults to `PROMOTE_CHILDREN` — children re-attach to the deleted node's parent (or surface as new roots when the deleted node was top-level). `mode: CASCADE` deletes the entire subtree. `DETACH DELETE` always runs, so all incident edges (`HAS_COMPONENT`, etc.) are cleaned up.

### Threat-actor side
TAs link to TTPs (MITRE), TTPs link to IOCs and detection rules. UI inspiration: the now-defunct Unit42 Playbook Viewer (clickable TTP nodes with detail panels). IOCs are **not just network-layer**: include imphash, ssdeep, sdhash, port, cron, service name, scheduler key, registry key, command-line strings.

### Detail pages are graph hubs, not leaves
Every detail page (CVE, Asset, ThreatActor, IOC, Rule, TTP, Hunt — present and future) must surface its graph neighbours as click-through relations. Reference register: OpenCTI. Each entity type owns a `*.repo.ts` for typed primary relations (e.g. CVE → affectedAssets, weaknesses, references, affectedCpes). When a 4th+ entity type lands, add a generic `relations` field returning a typed-union of any connected node, rendered in a "Related" panel at the bottom of every detail page. Detail pages have **no terminal** state — every row is a link.

### "Hunt" is a first-class feature
A Hunt = (selected ThreatActors) ⋈ (selected Inventory subset). Output:
- exports: Suricata, Sigma, YARA, OpenIOC, plain IOC list
- visualizations: subset/superset overlap with charts
- a Maltego-style expandable graph view across all data

### Multi-tenancy & auth (implemented)
Tenancy is `User` ∈ `Team` ∈ `Organization`. `Team` schema is in place but team membership semantics aren't wired yet (planned for asset/hunt features). Roles in an Org: `OWNER > ADMIN > ANALYST > VIEWER` (rank in `auth/types.ts`). `SCANNER_BOT` (service account) is planned, not built.

**Auth wire format:** JWT (HS256, 7-day default) signed with `JWT_SECRET`. Clients send `Authorization: Bearer <token>`. Active org context comes from the `X-Helyx-Org` header — required only for resolvers that need org scope.

**Where it lives:**
- `auth/jwt.ts` (sign/verify via `jose`) · `auth/password.ts` (argon2id via `@node-rs/argon2`) · `auth/errors.ts` (typed `GraphQLError` factories with `extensions.code`).
- `auth/context.ts` — `buildContext(req)` parses headers, returns `{ user, activeOrgId, activeOrgRole }`. Invalid tokens silently degrade to anonymous; bad org headers degrade to no-org. Resolvers decide what's protected.
- `auth/middleware.ts` — `assertAuthed(ctx)` and `assertOrgRole(ctx, 'ANALYST')` are TS assertion functions; after the call, `ctx.user` (and `activeOrgId`/`activeOrgRole`) are non-null types. Throws `UNAUTHENTICATED` / `FORBIDDEN` / `ORG_CONTEXT_REQUIRED` GraphQL errors.

**Resolver pattern:** business logic in `src/tenants/*.resolvers.ts`, all Cypher in `src/tenants/*.repo.ts`. Resolvers must NOT touch Neo4j directly — keep that boundary so we can swap query patterns / add DataLoader batching without rewriting resolvers. Repository functions take primitives; never receive `RequestContext`.

**Tenant data discipline (apply to every future feature):**
- Every tenant-owned node/edge carries `tenantId = activeOrgId`. Cypher must include `WHERE n.tenantId = $tenantId`.
- Repository function signature must take `tenantId` as a required argument so the type system fails the call when missing — never read `activeOrgId` from a global.
- Resolvers that touch tenant data start with `assertOrgRole(ctx, '<minimum>')`, then pass `ctx.activeOrgId` to the repo.
- Shared global graph (CVE, CPE, CWE, MITRE, public TA intel) is read-only and **not** tenant-scoped — keep separate so cross-tenant analytics ("N% of orgs vulnerable to CVE-X") stay possible without leaking tenant data.
- Visibility per entity: `private | team | org` (planned; not yet enforced).

### UI/UX expectations
"Mahal, tidak norak siber, tidak kekanakan." Avoid stock cyber tropes (matrix rain, neon-green-on-black, skull icons). Aim for the visual register of Linear / Vercel / Datadog — dense data, restrained color, typography does the work. Composables + shared components are mandatory (see Code constraints).

## Code constraints (non-negotiable, from `command.MD`)

These are the owner's stated rules. Treat them as review gates:

1. **File length**: hard ceiling **~1200 lines** for pure TS / repos / GraphQL schemas, **~2000 lines** for Vue SFCs (template+script+style natural bloat). Aim well below — split early when a file owns 3+ unrelated responsibilities.
2. **Backend DRY**: shared logic must be extracted; no copy-paste resolvers.
3. **No N+1**: every GraphQL resolver hitting Neo4j must be batched (DataLoader pattern or Cypher-level expansion). Assume reviewer will check query counts.
4. **Frontend composables + shared components**: reuse first, build second.
5. **Production-grade from the start**: scaling story = "add hardware/cloud nodes." No design choice that forces a future rewrite for horizontal scale (e.g., in-process state, sticky sessions, single-node caches without invalidation story).
6. Tests (unit/integration/e2e/k6 load), linter, Trivy in CI — **deferred**, do not build yet, but do not make choices that block them later.

### Cache + ephemeral state (Redis)

`apps/backend/src/cache/` is the single Redis surface. Never call ioredis directly outside this folder.

- `redis.ts` — singleton ioredis client, lazy-init, `pingRedis()` for health
- `index.ts` — `cacheGet/cacheSet/cacheDel/cacheWrap`. Use `cacheWrap(key, ttl, loader)` for cache-aside with single-flight (prevents stampede). Cache failures degrade to direct loader call — never throw on cache error.
- `auth.ts` — typed wrappers for user + role lookups. Invalidate via `invalidateUser(id)` / `invalidateUserOrgRole(userId, orgId)` on every user/membership mutation.

**Key namespace convention** (must match invalidator paths):
- `auth:user:<userId>` — user record (60s TTL)
- `auth:role:<userId>:<orgId>` — org role (60s TTL)
- `auth:csrf:<userId>` — CSRF token (7d TTL)
- `auth:refresh:<jti>` — refresh JTI primary (7d TTL)
- `auth:refresh:grace:<jti>` — refresh grace slot (30s TTL)
- `auth:fail:<email>:ip:<ip>` — login fail counter (15min TTL)
- `auth:lock:<email>:ip:<ip>` — account lockout (15min TTL)

Redis policy `volatile-lru` — only TTL'd keys are eviction-eligible. Auth keys are TTL'd, so they survive memory pressure unless their TTL expires.

Single-flight is per-process — multi-instance backend deployments still allow stampede across instances. Acceptable for current 60s-TTL user cache. If extending to deeper entities, add Redis SETNX distributed lock first.

### Auth flow (cookie + CSRF + refresh rotation)

**Login** (`mutation login`):
1. Server verifies password (argon2id + lockout check via email+IP key)
2. Server issues 15min access JWT + 7d refresh JTI
3. Server sets 3 cookies: `helyx_session` (HttpOnly access JWT), `helyx_csrf_token` (JS-readable CSRF), `helyx_refresh` (HttpOnly path=/graphql)
4. Server stores CSRF in `auth:csrf:<userId>` and refresh JTI in `auth:refresh:<jti>`

**Mutation request:**
1. Browser auto-sends all cookies (SameSite=Strict)
2. Frontend reads `helyx_csrf_token` cookie via JS, sends as `X-CSRF-Token` header
3. Backend `csrfGuard` (`apps/backend/src/index.ts`) verifies via graphql.parse AST: header == cookie == server-stored CSRF (defense in depth)
4. Resolver runs

**401 on access expiry (Apollo errorLink in `apps/web/src/api/apollo.ts`):**
1. errorLink intercepts 401 / `CSRF_NO_SESSION` extensions.code
2. Calls `mutation refresh` with `helyx_refresh` cookie (single-flight: 1 refresh per burst)
3. Server consumes refresh JTI atomically (Redis Lua MOVE: primary→grace) and issues new access + new refresh + new CSRF
4. errorLink retries the original mutation

**CSRF error codes** (`extensions.code`):
- `CSRF_NO_SESSION` — no session cookie
- `CSRF_MISSING_HEADER` — X-CSRF-Token header not attached
- `CSRF_COOKIE_MISMATCH` — header doesn't match `helyx_csrf_token` cookie
- `CSRF_SESSION_MISMATCH` — header doesn't match Redis-stored token
- `CSRF_SESSION_EXPIRED` — Redis CSRF token expired (call refresh)
- `REFRESH_EXPIRED` / `INVALID_REFRESH` / `NO_REFRESH` — refresh path failures (route to login)

**Bearer header (deprecated):**
- `Authorization: Bearer <jwt>` still accepted in dual-mode for one release
- CSRF guard skips Bearer requests but sets `X-Helyx-Auth-Deprecation` response header
- Bearer support is removed in a follow-up commit (Plan C Task 20) once prod logs confirm zero Bearer traffic for 7+ days

### Audit log (`audits/`)

`apps/backend/src/audits/` writes append-only `:AuditEvent` nodes to Neo4j. Wired to 4 sensitive ops as of Phase 3 (`resolveRawStakeholder`, `bulkResolveRawStakeholders`, `archiveCase`, `archiveStakeholder`). Standard: OWASP ASVS L2 V10.3.4.

`logAudit(tenantId, actorUserId, action, target, before, after)` takes primitives (NOT ctx) per repo/resolver boundary. Action naming convention: `<entity>.<verb>` lowercase, e.g. `case.archive`, `reconciliation.bulk_resolve`.

**Completeness caveat:** audit write is NOT atomic with the audited operation. If audit fails (Redis/Neo4j blip), op succeeds un-audited. Acceptable per project policy; for higher integrity, future phase streams to dedicated append-only sink.

**Retention:** AuditEvent has NO TTL — append-only forever. Implement retention before scaling:

```cypher
MATCH (a:AuditEvent) WHERE a.ts < datetime() - duration({years: 2}) DETACH DELETE a;
```

**Compliance query — who did what in last 30d:**

```cypher
MATCH (a:AuditEvent {tenantId: $tenantId})
WHERE a.actorUserId = $userId AND a.ts >= datetime() - duration({days: 30})
RETURN a ORDER BY a.ts DESC LIMIT 100;
```

### Security baseline (OWASP ASVS L2)

Helyx auth/session/logging implementation aligns with OWASP ASVS L2:
- V2 (Authentication): argon2id passwords, lockout email+IP, generic error messages (no enumeration)
- V3 (Session): HttpOnly+SameSite cookies, 15m access + 7d refresh w/ rotation + 30s grace
- V4 (Access control): tenantId guard on every Cypher; assertOrgRole at every resolver
- V8 (Data protection): pino redact paths for secrets in logs
- V10 (Logging): :AuditEvent wired to 4 sensitive ops; primitive signature lets background jobs emit

Future ISO 27001 / SNI ISO 27001 alignment (Indonesian gov compliance ask) layers on top of this baseline.

### Release governance (F1 + F2 + H5)

CTI export pipeline enforces a 3-layer trust model. Every push path (H7 MISP, H7 OpenCTI, H9 EclecticIQ, H9 TAXII server) must consult these gates — never bypass.

**F1 — Release tier (`cti/kinds.ts`):** 4-tier need-to-know ladder, dashed-form storage / underscored-form GraphQL enum:

| Tier | Rank | TLP marking |
| --- | --- | --- |
| `public` | 1 | TLP:WHITE |
| `cross-agency` | 2 | TLP:GREEN |
| `sectoral` | 3 | TLP:AMBER |
| `internal` | 4 (default) | TLP:RED |

Every `:DetectionRule` and `:Hunt` carries `releaseTier` (defaults `internal` for legacy nodes via `coalesce()` in repo RETURNs). `setRuleReleaseTier` / `setHuntReleaseTier` mutations write a `:ReleaseTierChange` audit chain + `AuditEvent`. Push pre-condition: `rule.tier ≤ target.maxTier`.

**F2 — Approval state (`rules/repo.ts`):** Three fields on `:DetectionRule`: `approvedByUserId`, `approvedAt`, `approvalContentHash` (sha256 captured at approve time). `approveRule` / `unapproveRule` mutations emit `:RuleApproval` chain + `AuditEvent`. **Stale = `sha256(current content) != approvalContentHash`** — content edited post-approval blocks push until re-approval. Browser SubtleCrypto runs the same hash for instant client-side stale detection (`isApprovalStale` in `useRules.ts`).

**F1c — Push readiness guard (`cti/release/guards.ts`):** Pure function `checkRulePushAllowed(rule, targetMaxTier)` returning `{ allowed, reason: 'tier_too_high' | 'unapproved' | 'stale_approval' | null, detail }`. Same guard runs everywhere a push happens. Pre-flight via `dryRunPushRule(ruleId, targetMaxTier): PushReadiness` (VIEWER role). FE `useRulePushReadiness` runs all 4 tiers in one aliased query → 4-row grid on `/rules/:id`.

**H5 — STIX 2.1 export (`exporters/stix.ts`):** `exportHuntAsStix(huntId)` packs only F2-approved + non-stale rules. TLP marking-def auto-derived from `Hunt.releaseTier` per F1. STIX ids stable: `indicator--<sha256(rule.id)>` so re-exports dedupe downstream. Validated against focused zod schemas (`stix-validate.ts`) before return; generator bugs fail loud. Persists `:StixExport {bundleId, contentHash, signature, signatureAlgorithm}` + `(:StixExport)-[:DERIVED_FROM]->(:Hunt)` + `[:INCLUDES]->(:DetectionRule)` + `[:SIGNED_BY]->(:CtiOrgKeypair)`.

**F2 sign — Ed25519 detached signatures (`cti/sign/`):** Per-org `:CtiOrgKeypair`, lazy-generated on first export. Private key AES-256-GCM encrypted at rest with `CTI_SIGNING_MASTER_KEY` env (64 hex chars / 32 bytes). **Separate secret tier from `JWT_SECRET`** — different blast radius, do not collapse. MERGE-on-tenantId is race-safe. Every bundle ships with `signature` (base64) + `signerPublicKeyPem` so verifiers can `crypto.verify(null, bundleBytes, pub, sig)` without a roundtrip.

**Operator surfaces:**
- `/rules/:id` → 3 sections: approval (with stale chip) → push readiness (4-tier grid) → tier picker
- `/graph?hunt=<id>` → tier `<select>` in header + Generate rules + Download zip + Export STIX buttons
- Every governance mutation emits `AuditEvent` with the `<entity>.<verb>` action naming convention

**.env requirement summary:**
- `CTI_SIGNING_MASTER_KEY` — required before first STIX export (clear startup-time error if missing). Generate: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
- `JWT_SECRET` — required at boot (existing)

**Migrations involved:** `m017_release_policy_schema` (tier indexes + ReleaseTierChange) · `m018_cti_org_keypair` (CtiOrgKeypair + RuleApproval) · `m019_stix_export` (StixExport + edges).

### Demo data (`pnpm seed:mock`)

Idempotent additive seeder at `apps/backend/src/scripts/seed-mock-demo.ts`. Produces realistic Indonesian sektoral inventory + governance-state-rich hunts so the F1+F2+H5 loop demos visibly without manual setup. Re-run anytime — MERGE-based, won't duplicate.

Per org (3 total):
- 7 stakeholders with proper sektor (Acme: Industri/Transportasi/Keuangan/Perdagangan/TIK · Pajak: Administrasi Pemerintahan · Telkom: TIK)
- Asset trees with `.go.id` / `.co.id` domains + RFC1918 IPs
- 1 well-shaped hunt with 6-7 generated rules across YARA/SURICATA/SIGMA, mixed tier (1-2 public · 2-3 cross-agency · 1-2 sectoral · 1 internal) and mixed approval (3-4 fresh approved · 1 stale · 1-2 unapproved)
- 1 historical `:StixExport` per hunt + lazy-created `:CtiOrgKeypair` (exercises the real signing + persistence path)

**Demo URLs (after seed):**
- `/graph?hunt=d11fce1e-077c-4c4d-a99c-f1de3ffdd94d` — Acme · Q2 Ransomware Garuda
- `/graph?hunt=ed147e07-04c8-4947-a925-4684517b0e41` — Ditjen Pajak · Operasi Pemilu
- `/graph?hunt=e618700b-75a8-4c01-8d3c-9c4601a24ede` — Telkom · APT41 Backbone Anomaly

**Test users** (existing — not seeded by this script): `alice@helyx.test` (Acme + Pajak), `bob@helyx.test` (Telkom).

## When extending this file

Once real code exists, this file should grow sections for:
- Build / dev / test commands (with the single-test invocation form).
- Module boundaries that aren't obvious from the directory tree (e.g., where tenant filtering middleware lives, where the global vs. tenant graph split is enforced).
- Any deviation from `command.MD` and *why* — `command.MD` is a brief, not a spec, and decisions will diverge.

Do **not** add generic engineering advice or restate what's in `command.MD` verbatim.
