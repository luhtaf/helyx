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
pnpm db:up                     # docker compose up -d neo4j
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

Backend listens on `:4000/graphql`. Web dev server on `:5173` proxies `/graphql` → backend. Neo4j browser on `:7474`, bolt on `:7687`. Default dev creds: `neo4j / helyxdev` (in `.env.example`). `JWT_SECRET` (≥32 chars) is required — generate with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.

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

1. **File length**: hard ceiling **500–1000 lines** per file, and that is already the absolute max — aim well below. Split early.
2. **Backend DRY**: shared logic must be extracted; no copy-paste resolvers.
3. **No N+1**: every GraphQL resolver hitting Neo4j must be batched (DataLoader pattern or Cypher-level expansion). Assume reviewer will check query counts.
4. **Frontend composables + shared components**: reuse first, build second.
5. **Production-grade from the start**: scaling story = "add hardware/cloud nodes." No design choice that forces a future rewrite for horizontal scale (e.g., in-process state, sticky sessions, single-node caches without invalidation story).
6. Tests (unit/integration/e2e/k6 load), linter, Trivy in CI — **deferred**, do not build yet, but do not make choices that block them later.

## When extending this file

Once real code exists, this file should grow sections for:
- Build / dev / test commands (with the single-test invocation form).
- Module boundaries that aren't obvious from the directory tree (e.g., where tenant filtering middleware lives, where the global vs. tenant graph split is enforced).
- Any deviation from `command.MD` and *why* — `command.MD` is a brief, not a spec, and decisions will diverge.

Do **not** add generic engineering advice or restate what's in `command.MD` verbatim.
