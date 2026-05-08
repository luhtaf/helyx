# Polymorphic Stakeholder Refactor (Phase R)

> Date: 2026-05-08 · Branch: main · Status: PROPOSED · Severity: BREAKING

## Goal

Collapse the `Organization` tenant boundary into the `Stakeholder` model, producing a single polymorphic entity that supports both:

- **National Sentry pattern** (BSSN): operator monitors hundreds of constituents in a hierarchical tree
- **Per-org pattern** (Acme via Ziti): customer logs in, sees only their own slice

Same data model, different access scope.

## Why now

`/autoplan` Phase G1 just shipped (Maltego graph). Working through it surfaced data-model confusion: 3 orgs each with 60+ stakeholders feels redundant. Spiderfoot ingest produces a `Stakeholder` per `Organisasi`, not per `Organization`. CA cases target a Stakeholder. Sensor lives on Stakeholder. Org was always a thin auth wrapper around what is fundamentally Stakeholder ops.

The rework also unblocks: hierarchy navigation in graph view, sektor-aware aggregate queries across constituents, multi-stakeholder dashboards, and BSSN-as-operator semantics for ISO 27001 compliance reporting.

## Tech intent

```
                 ┌──────────────────────────────────┐
                 │ User                             │
                 │ + globalRole: NSOC|null          │  ← BSSN/NSOC ops
                 └──────────────┬───────────────────┘
                                │
                                ▼ MEMBER_OF (role: OWNER|ADMIN|ANALYST|VIEWER)
                 ┌──────────────────────────────────┐
                 │ Stakeholder                      │
                 │ + slug, name, sektor, coords     │
                 │ + isOperator: bool               │
                 │ + parentStakeholderId: ID|null   │  ← N-level hierarchy
                 └──────────────┬───────────────────┘
                                │
                                ▼ OWNS / ASSESSED / RESOLVED_TO etc.
                       Asset, Case, RawStakeholder, SoftwareComponent, Sbom
```

**Access rule** (computed at request time, cached 60s):
```
allowedStakeholderIds = if user.globalRole = 'NSOC' then ALL
                       else
                         {s.id : (user)-[:MEMBER_OF]->(s)} ∪
                         {descendant.id : ancestor.id ∈ direct_member_set,
                                          (descendant)-[:CHILD_OF*1..]->(ancestor)}
```

Single recursive Cypher computes this. Result feeds every tenant-scoped query.

---

## Data model changes

### m016: Stakeholder polymorphism + hierarchy

```cypher
// New fields
ALTER (Stakeholder) ADD isOperator BOOLEAN DEFAULT false;
ALTER (Stakeholder) ADD parentStakeholderId STRING;
CREATE INDEX stakeholder_parent IF NOT EXISTS FOR (s:Stakeholder) ON (s.parentStakeholderId);
CREATE INDEX stakeholder_operator IF NOT EXISTS FOR (s:Stakeholder) ON (s.isOperator);

// Hierarchy edge (mirror property for performant graph traversal)
CREATE (child)-[:CHILD_OF]->(parent)  // populated via parentStakeholderId backfill
```

### m017: User.globalRole + drop Organization

```cypher
// Add NSOC role
ALTER (User) ADD globalRole STRING;  // 'NSOC' | null

// Re-target MEMBER_OF: User-MEMBER_OF-Org → User-MEMBER_OF-Stakeholder
// The relationship type stays MEMBER_OF; only the target label changes.
```

After m017 fully runs, `:Organization` label is dropped from the schema. Some properties (`o.slug`, `o.name`, `o.id`) migrate to the operator-stakeholder created in m018.

### m018: Backfill — Org → operator Stakeholder

For each existing Organization in DB:
1. Create a Stakeholder `{ id: org.id, slug: org.slug, name: org.name, isOperator: true, parentStakeholderId: null }` (re-using org.id so all foreign refs stay valid)
2. Move every User-MEMBER_OF-Organization edge → User-MEMBER_OF-Stakeholder (target ID stays the same, label flips)
3. For every existing Stakeholder previously scoped via `tenantId`, set `parentStakeholderId = tenantId` (the org's id is now the operator stakeholder's id, so this stitches the hierarchy)
4. For every Asset/Case/SoftwareComponent/Sbom/RawStakeholder/AuditEvent: rename `n.tenantId` → `n.stakeholderId`. The value points at the operator stakeholder (root) — entity ownership of more specific stakeholders is via `:OWNS`/`:ASSESSED`/`:RESOLVED_TO` already (no scope change needed; access is computed via hierarchy descent)
5. Drop `:Organization` label entirely

### Special seed: BSSN as a top-level operator

Per user direction, BSSN exists as a Stakeholder node. A bootstrap migration (`m019_seed_bssn_operator`) creates:
```cypher
CREATE (bssn:Stakeholder {
  id: 'bssn-operator',
  slug: 'bssn',
  name: 'Badan Siber dan Sandi Negara',
  isOperator: true,
  parentStakeholderId: null,
  createdAt: datetime()
});
```

Existing constituent stakeholders (DJP, Telkom, Acme — currently top-level operators from m018) get `parentStakeholderId = 'bssn-operator'` IF they are gov/critical-infra. Acme stays top-level (commercial, not under BSSN). Decision logic in m019 commentary, default: NOT under BSSN unless operator explicitly says so via env or post-migration script.

For demo: m019 ships with BSSN at top and DJP+Telkom moved under it; Acme stays top-level. Operator can re-parent post-migration.

---

## Auth model changes

### Backend

`auth/context.ts`:
```ts
interface RequestContext {
  user: AuthUser | null;
  globalRole: 'NSOC' | null;
  // Replaces activeOrgId
  activeStakeholderId: string | null;
  // Replaces activeOrgRole
  activeStakeholderRole: 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER' | null;
  // NEW: precomputed allowed scope (cache: auth:scope:<userId>:<activeStakeholderId>, 60s TTL)
  allowedStakeholderIds: string[] | 'ALL';
}
```

`buildContext(req)` reads the new `X-Helyx-Stakeholder` header (legacy `X-Helyx-Org` is also accepted for one release as alias).

`assertStakeholderRole(ctx, role)` replaces `assertOrgRole`. Three checks:
1. user authenticated
2. `globalRole === 'NSOC'` → pass
3. else: user has MEMBER_OF activeStakeholderId (direct or via ancestor chain) at >= role rank

Cypher queries replace `WHERE n.tenantId = $tenantId` with `WHERE n.stakeholderId IN $allowedStakeholderIds OR $allowedStakeholderIds = 'ALL'` (the `'ALL'` sentinel handled by short-circuit in the resolver, e.g., `if (scope === 'ALL') return; else conditions.push('n.stakeholderId IN $allowed')`).

### Frontend

`stores/auth.ts`:
```ts
interface AuthState {
  user: AuthUser | null;
  globalRole: 'NSOC' | null;
  activeStakeholderId: string | null;
  activeStakeholderRole: OrgRole | null;
  // List of stakeholders user can switch to (from initial /me query)
  accessibleStakeholders: { id: string; name: string; isOperator: boolean; role: OrgRole }[];
}
```

Sidebar: "Org switcher" → "Stakeholder picker". Dropdown lists every stakeholder user has access to (direct + descendants of any direct member). NSOC gets typeahead search across all.

---

## Resolver scope rewrite

Every tenant-scoped resolver gets one of these patterns:

**Pattern 1 — single-stakeholder read** (the hot path, 90% of resolvers):
```ts
async function listAssets(ctx, filter) {
  assertStakeholderRole(ctx, 'VIEWER');
  // Active stakeholder + descendants. Recursive Cypher computes once per request.
  const allowed = await scopeFor(ctx);
  return session.run(
    `MATCH (a:Asset) WHERE a.stakeholderId IN $allowed
     ${filter.kind ? 'AND a.kind = $kind' : ''}
     RETURN ${ASSET_RETURN}`,
    { allowed, ...filter }
  );
}
```

**Pattern 2 — write** (mutation):
```ts
async function createAsset(ctx, input) {
  assertStakeholderRole(ctx, 'ANALYST');
  // Asset must be created under activeStakeholderId; operator role 
  // restricted to direct members or NSOC for cross-stakeholder writes.
  return repo.createAsset({ ...input, stakeholderId: ctx.activeStakeholderId });
}
```

**Pattern 3 — NSOC global aggregate** (e.g., per-sektor cross-tenant analytics):
```ts
async function nationalSektorBreakdown(ctx) {
  assertGlobalRole(ctx, 'NSOC');  // hard gate
  return session.run('MATCH ... no scope filter');
}
```

---

## File-by-file change scope

| Layer | Files | LoC delta |
|---|---|---|
| Backend migrations | m016, m017, m018, m019 (4 new) | ~250 |
| Backend auth | context.ts, middleware.ts, errors.ts, jwt.ts (signing payload), cache/auth.ts | ~150 |
| Backend repos (every tenant-scoped repo) | assets/, cases/, stakeholders/, reconciliation/, sources/spiderfoot/, audits/, sbom/, dashboard/ | ~400 (mostly find/replace tenantId → stakeholderId + scope helper call) |
| Backend resolvers | every `*.resolvers.ts` that called assertOrgRole | ~200 (function rename) |
| GraphQL schema | drop Organization type + activeOrg field, add globalRole + Stakeholder.children + activeStakeholder | ~80 |
| Frontend auth store | stores/auth.ts | ~60 |
| Frontend Sidebar / org switcher | components/layout/Sidebar.vue, OrgPicker.vue → StakeholderPicker.vue | ~120 |
| Frontend Apollo wiring | api/apollo.ts (header rename) | ~10 |
| Tests / smoke | manual verify scripts | n/a |

**Total LoC delta**: ~1300 across backend + frontend. Most is mechanical (find/replace `tenantId` → `stakeholderId`).

---

## Migration safety + rollback

### Pre-migration

```bash
# Snapshot current state (irreversible without this)
docker exec helyx-neo4j neo4j-admin database dump neo4j \
  --to-path=/var/lib/neo4j/data/dumps
docker cp helyx-neo4j:/var/lib/neo4j/data/dumps/neo4j.dump /tmp/helyx-pre-R-refactor.dump

# Snapshot Redis (auth cache + sessions)
docker exec helyx-redis redis-cli SAVE
docker cp helyx-redis:/data/dump.rdb /tmp/helyx-redis-pre-R.rdb
```

### Forward migration

`pnpm --filter @helyx/backend migrate` runs m016 → m017 → m018 → m019 sequentially. Each migration uses single-transaction Cypher with `IF NOT EXISTS` guards so partial re-runs are safe.

After all 4 apply:
1. Restart backend (auth context shape changes — old in-flight requests would mismatch)
2. Manual smoke: login as alice, verify stakeholder picker shows DJP + acme operators (alice is OWNER of both)
3. Verify NSOC: temporarily flag verify2 as `globalRole='NSOC'`, confirm cross-stakeholder read works
4. Verify hierarchy: as DJP-admin, confirm read access to KPP descendants

### Rollback

If any verification step fails:
```bash
docker compose down
docker volume rm helyx_neo4j_data
docker compose up -d neo4j
docker exec helyx-neo4j neo4j-admin database load neo4j \
  --from-path=/var/lib/neo4j/data/dumps --overwrite-destination
```

Restart backend. Pre-migration code on previous git commit. Estimated rollback time: 5 min.

---

## Implementation steps

### Phase R1 — Schema migrations (3 hours)

| # | Step | Effort |
|---|---|---|
| R1.1 | Pre-migration backup script + verification | 15m |
| R1.2 | m016: Stakeholder.isOperator + parentStakeholderId + indexes | 20m |
| R1.3 | m017: User.globalRole field | 10m |
| R1.4 | m018: Org → operator Stakeholder backfill (most complex — Cypher path traversal) | 60m |
| R1.5 | m019: Seed BSSN operator + reparent gov constituents | 30m |
| R1.6 | Drop :Organization label, drop legacy tenantId properties (FINAL — only after R3 verify) | 15m |
| R1.7 | Migration smoke test in dev: backup → migrate → verify counts → diff before/after | 30m |

### Phase R2 — Backend auth + resolvers (5 hours)

| # | Step | Effort |
|---|---|---|
| R2.1 | auth/context.ts: globalRole, activeStakeholderId, scope helper | 45m |
| R2.2 | auth/middleware.ts: assertStakeholderRole, assertGlobalRole | 30m |
| R2.3 | cache/auth.ts: scope cache (`auth:scope:<userId>:<stakeholderId>`, 60s TTL) | 30m |
| R2.4 | jwt.ts: include globalRole in token payload | 15m |
| R2.5 | Mass rename `assertOrgRole` → `assertStakeholderRole` across all resolvers (sed-able) | 30m |
| R2.6 | Repo layer: rewrite every Cypher to use stakeholderId scope (sed-able for the property, manual for the IN-clause variant) | 90m |
| R2.7 | GraphQL schema: drop Organization type, add Stakeholder.children/parent fields, drop activeOrg from Query.me | 30m |
| R2.8 | Spiderfoot ingest: `--tenant` accepts both old IDs (backwards-compat) | 15m |
| R2.9 | Backend smoke: curl /me with verify2 → see stakeholder picker shape, query stakeholders → see DJP + acme + 60+ children | 30m |

### Phase R3 — Frontend (3 hours)

| # | Step | Effort |
|---|---|---|
| R3.1 | useAuthStore: drop activeOrgId, add activeStakeholderId + globalRole + accessibleStakeholders | 30m |
| R3.2 | Apollo headers: `X-Helyx-Org` → `X-Helyx-Stakeholder` | 5m |
| R3.3 | Sidebar OrgPicker → StakeholderPicker (typeahead for NSOC, dropdown otherwise) | 60m |
| R3.4 | Login flow: post-login pick stakeholder OR auto-select if only 1 accessible | 30m |
| R3.5 | DashboardView: scope-aware (Mode 1/2/3 from spec) — filter chip + per-stakeholder breakdown | 60m |
| R3.6 | StakeholdersView: include children when current stakeholder is operator (recursive list) | 30m |
| R3.7 | Frontend smoke (browse): login as alice → 4 stakeholders accessible, switch to DJP → see 60+ child stakeholders, drill to one → asset list scoped | 30m |

### Phase R4 — Hierarchy view + polish (2 hours)

| # | Step | Effort |
|---|---|---|
| R4.1 | Stakeholder.children resolver + UI tree view | 45m |
| R4.2 | Graph transform: Stakeholder → "Show children" | 15m |
| R4.3 | Sektor breakdown chart on Dashboard (NSOC view) | 45m |
| R4.4 | Audit log entries: stakeholderId-scoped, NSOC sees all | 15m |

**Total ≈ 13 hours**. Conservative — likely 15-17 with debug + edge cases.

---

## What's NOT in scope

- **Hunt save/load** (Phase G2 from graph plan) — separate feature, no dependency on this refactor
- **Per-stakeholder billing/quotas** — could come later if multi-tenant SaaS becomes commercial
- **OAuth/OIDC SSO via Ziti** — Phase Z, separate dependency on identity provider integration
- **Stakeholder type variants** (e.g., `kind: GOV | COMMERCIAL | NGO`) — defer until we have data showing it's needed
- **Cross-stakeholder data sharing** (one stakeholder shares CVE intel with another) — out of scope, federated model is a future Phase

---

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Auth migration mid-flight: existing JWT tokens reference `activeOrgId` — clients with stale tokens get 401 | HIGH | Backend accepts both header names for 1 release. JWT payload doesn't carry activeOrgId — that's request-scoped via header — so old tokens still work |
| 2 | Cypher scope check is recursive; performance on deep hierarchies | MEDIUM | Hierarchy expected ≤4 levels (BSSN → Sektor coordinator → Org → Sub-org). Recursive Cypher with `*0..5` cap. Cache scope per request via Redis 60s TTL |
| 3 | Backfill assigns wrong parent for an edge case (e.g., a Stakeholder that was created post-spiderfoot with no original tenantId) | HIGH | m018 rejects rows missing tenantId loudly; operator must hand-fix before m019 runs |
| 4 | Frontend cache (Apollo cache + localStorage auth state) becomes inconsistent during refactor deploy | MEDIUM | Force logout-all on first deploy of R2; clear localStorage `helyx.auth` key on app boot if `helyx.auth.version < 2` |
| 5 | Spiderfoot ingest `--tenant <orgId>` semantics changes — existing cron scripts break | LOW | Backwards-compat alias for 1 release. Log deprecation warning |
| 6 | Audit log retention queries use `tenantId` — break post-migration | MEDIUM | Backfill audit entries' `tenantId` → `stakeholderId` (just a property rename) |

---

## Decision log

- **Polymorphic via `parentStakeholderId` + `:CHILD_OF` edge** (vs label inheritance): keeps Stakeholder a single type, easier to query. Edge `:CHILD_OF` for graph traversal performance; property `parentStakeholderId` for fast `MATCH (s {parentStakeholderId: $id})` lookup.
- **N-level hierarchy** (vs 2-level): future-proof. BSSN → Sektor coord → Kementerian → Direktorat → KPP is realistic.
- **NSOC as global role on User** (vs separate `:NSOCOperator` label): users are users; role is the difference. Simpler.
- **BSSN as Stakeholder node** (vs implicit-only via NSOC): per user direction. Lets graph view render BSSN as the explorable root of Indonesian gov hierarchy.
- **Keep `MEMBER_OF` edge type** (vs new `:MEMBERS`): less migration, semantically still "user belongs to entity".

---

## Pre-Execute Revision Delta (post-review)

Subagent-only review (Codex 402 unavailable). 3 CRITICAL + 3 HIGH + 4 MEDIUM + 2 LOW findings. Plan amended in-place.

### CRITICAL fixes baked

**C1 — m018 ID collision risk + reuse-org-id-as-stakeholder-id is unsound.**
Original plan: `Create a Stakeholder { id: org.id, ... }` reuses org id so foreign refs stay valid. But existing Stakeholders already have UUIDs from `randomUUID()` and the new operator might collide; deterministic CREATE on a duplicate id fails mid-transaction.
**Fix**: m018 generates a NEW UUID for the operator stakeholder, then atomically rewrites every foreign ref (`User-MEMBER_OF-Org`, `RawStakeholder.tenantId`, `AuditEvent.tenantId`, etc.) within a single `executeWrite` tx. Pre-flight assertion: `MATCH (s:Stakeholder {id: $newOpId}) RETURN count(s)` must be 0 before insert. Operator-id mapping table maintained in temp `:_MigrationMap` nodes for traceability + rollback.

**C2 — Pattern 1 scope check is semantically WRONG for hierarchy.**
Original plan: `Asset.stakeholderId IN $allowed` with `$allowed` = direct + descendant ids. But m018 sets `Asset.stakeholderId = <operator_id>` (root), while `:OWNS` points to the leaf KPP. A KPP-scoped viewer's `$allowed = [kpp_id]` would NOT include the operator → ZERO results. Plan glosses over this contradiction.
**Fix**: Pick ONE source of truth: backfill `Asset.stakeholderId` from the `:OWNS` target (the actual owning leaf stakeholder), NOT from the legacy tenantId. Same for Case (`:ASSESSED` target), SoftwareComponent (`:HAS_COMPONENT` parent's owner), Sbom (`:OF_ASSET` chain). m018 step 4 now reads: `MATCH (n)-[:owning_edge]->(stakeholder) SET n.stakeholderId = stakeholder.id`. Drop the "operator stakeholder owns everything" interpretation.

**C3 — m018 not idempotent + no concurrency guard.**
Original: "single-transaction Cypher with IF NOT EXISTS" — but property renames don't have IF-NOT-EXISTS semantics, so a crash mid-rename leaves half the graph migrated; re-run sees zero `:Organization` and marks itself complete.
**Fix**: m018 uses `apoc.periodic.iterate` with `batchSize: 1000, parallel: false` and a final assertion `MATCH (n) WHERE n.tenantId IS NOT NULL RETURN count(n) AS leftovers` that fails the migration if `leftovers > 0`. Each step (org→stakeholder, MEMBER_OF retarget, property rename per entity type) is its own apoc.periodic call so resume from the right batch is possible. **Migration window**: explicit downtime — block app traffic via reverse-proxy maintenance flag during R1.

### HIGH fixes baked

**H1 — Recursive scope query at every request.**
60s Redis cache helps but stampede on cold cache + multi-instance deploy = N×Neo4j load.
**Fix**: at WRITE time, maintain `Stakeholder.ancestorPath: [String]` (denormalized list of all ancestor ids in chain order). Scope check becomes a scalar-list intersect — no recursive `*0..5` traversal. Recompute when `parentStakeholderId` changes (rare: stakeholder re-parenting). Adds ~50 LoC to stakeholder write paths but eliminates the per-request recursive Cypher.

**H2 — Service-account JWTs (helyx-landing@bot) carry no migration story.**
Plan dismissed this as "JWTs don't carry orgId" but the service account's auth flow *does* depend on `auth:role:<userId>:<orgId>` Redis cache that goes stale after m018.
**Fix**: R2.x adds explicit `redis-cli SCAN+DEL auth:*` post-migration step + re-mints service-account tokens before cutover. Document in deploy runbook.

**H3 — Audit log field rename breaks compliance queries silently.**
AuditEvent is append-only forever (CLAUDE.md). Renaming `tenantId` → `stakeholderId` breaks documented compliance Cypher silently for historical entries.
**Fix**: KEEP both properties on AuditEvent. `tenantId` immutable for historical entries pre-R; `stakeholderId` populated for all new entries post-R. CLAUDE.md compliance query updated to OR both. Future m020 cleanup runs only after 90d retention rolls past R cutover date.

**H4 — In-flight header skew during deploy.**
Original plan: backend + frontend ship simultaneously; backend accepts both headers. But during the 5-15s backend restart, frontend already sends new header → 401 storm via errorLink retry.
**Fix**: TWO-RELEASE sequence. Release N ships backend with dual-header accept (X-Helyx-Org alias for X-Helyx-Stakeholder). Bake ≥1h. Release N+1 ships frontend rename. Documented in CLAUDE.md deprecation contract pattern (mirrors Bearer removal).

### MEDIUM fixes baked

**M1 — BSSN seed not idempotent + non-portable.**
Original m019 hardcoded `id: 'bssn-operator'`, slug `'bssn'`. Re-run fails; non-Indonesian deploys get unwanted BSSN node.
**Fix**: m019 driven by env: `HELYX_OPERATOR_ROOT_NAME`, `HELYX_OPERATOR_ROOT_SLUG`. MERGE on slug (idempotent). No-op when env unset (Acme-via-Ziti deploy stays clean).

**M2 — Reconciliation semantics undefined for cross-stakeholder raws.**
Post-refactor `RawStakeholder.stakeholderId → operator_id` (the importing operator). When NSOC user resolves a raw to a sub-stakeholder, ownership inheritance unclear.
**Fix**: spec `resolveRawStakeholder(rawId, targetStakeholderId)` requires `targetStakeholderId` in input. Repo asserts target is in `allowedStakeholderIds`. Audit event `'reconciliation.cross_operator_resolve'` emitted when source operator ≠ target lineage.

**M3 — Stakeholder picker has no pagination/search story.**
NSOC's `accessibleStakeholders` could be 1000s — payload explodes.
**Fix**: `/me` returns direct memberships only + `hasGlobalAccess: bool` flag. Picker uses server-side `Query.searchStakeholders(q: String, first: Int = 20)` with substring match on name+slug. Frontend typeahead debounced 300ms.

**M4 — `Stakeholder.cves` for hierarchy node blows up.**
BSSN.cves under default plan = UNION across all descendants — query OOMs.
**Fix**: `Stakeholder.cves(descendants: Boolean = false, perPage, page)` — default `descendants: false` returns only the stakeholder's own assets' CVEs. Sektor-aggregate (BSSN dashboard view) goes through a separate `Query.sektorCveBreakdown` pre-aggregated path.

**M5 — Rollback time estimate is fictional.**
Plan said 5min; realistic with 4M+ catalog nodes is 10-60min.
**Fix**: R4.x adds rollback rehearsal in dev with full prod-shaped data — record actual wall time. Use `neo4j-admin database backup` (online, hot backup) instead of dump. Document recorded times in this plan post-rehearsal.

### LOW fixes baked

**L1 — Spiderfoot CLI flag deprecation contract.**
**Fix**: `--tenant <id>` aliases `--stakeholder <id>` for one release. Log WARN with deprecation notice. Removal commit tracked in TODOS.

**L2 — Verification gap: cached scope after MEMBER_OF demotion.**
**Fix**: `cache/auth.ts` adds `invalidateUserScope(userId)` callable from every MEMBER_OF mutation. R4.5 verification scenario added: demote a user mid-session, confirm next request rejects within ≤5s (faster than 60s TTL).

### Updated effort estimate

| Phase | Original | Revised |
|---|---|---|
| R1 schema + migration | 3h | **5h** (apoc.periodic + ancestorPath + assertion) |
| R2 backend auth + scope | 5h | **6h** (denorm ancestorPath + invalidateUserScope + audit dual-prop) |
| R3 frontend | 3h | **3.5h** (server-side stakeholder search) |
| R4 hierarchy + polish + verify | 2h | **3h** (rollback rehearsal + 2 new verify scenarios) |

**New total: 17.5h** (was 13h). Delta = 4.5h to bake the 3 CRITICAL + 3 HIGH fixes.

### Two-release deploy sequence (strict)

```
Release N    [backend]  Dual-header accept (X-Helyx-Org → X-Helyx-Stakeholder alias)
                        + scope cache + ancestorPath denorm
                        Frontend unchanged
                        ─── BAKE ≥1 hour ───
                        Verify zero X-Helyx-Org traffic in logs

Release N+1  [migrations]  m016 → m017 → m018 → m019 (downtime ~10-30 min)
             [backend]   Drop X-Helyx-Org alias; add NSOC role logic
             [frontend]  Stakeholder picker + Apollo header rename
             [redis]     SCAN+DEL auth:* (force re-cache)
                         Re-mint service account tokens
```

---

## Verification scenarios

After all 4 phases ship, manually verify all 7 access patterns:

1. **NSOC ops**: `verify2` flagged globalRole=NSOC → sees ALL stakeholders + can drill into any
2. **Operator admin**: `alice` MEMBER_OF DJP (OWNER) → sees DJP + 60 KPP children, can mutate any
3. **Operator viewer**: `bob` MEMBER_OF telkom (OWNER) → sees telkom only (no children seeded yet)
4. **Single-stakeholder analyst**: a new test user MEMBER_OF "KPP Pratama Jakarta Selatan" (ANALYST) → sees only that one stakeholder, can mutate within
5. **Single-stakeholder viewer** (read-only): same user but VIEWER role → sees but can't mutate
6. **Multi-stakeholder user**: a test user MEMBER_OF DJP-Acme (admin both) → switcher shows both, scope changes per active
7. **Hierarchy descent denied**: viewer of DJP cannot read Acme stakeholder data (cross-operator boundary)

Each scenario gets a recorded GraphQL query + expected response in `docs/verification/polymorphic-r-verify.md`.
