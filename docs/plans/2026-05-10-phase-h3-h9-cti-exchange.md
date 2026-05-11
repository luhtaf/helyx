# Phase H3-H9 — Full Operational CTI Exchange + H2 Follow-ups

> Date: 2026-05-10 · Branch: main · Status: PROPOSED
> Foundation: Phase H1 (DetectionRule entity) + H2 partial (generators) shipped 2026-05-10

## Goal

Take Helyx from "internal rule generator" to "production CTI exchange node" — bidirectional integration with the broader threat-intelligence ecosystem (MISP, OpenCTI, EclecticIQ, OTX, AlienVault, custom STIX-TAXII servers) plus operational deploy paths (Wazuh, Suricata reload).

User intent recap (verified): Hunt → DetectionRule generation already works (H2). What's left is (a) richer hunt workflows that pull/seed from MITRE TTPs, (b) structured markup of which IOCs become rules vs which assets get the deploy, (c) export/import via STIX as the lingua franca, (d) direct push to MISP/OpenCTI/EclecticIQ, (e) actual webhook deploy to live SIEM.

This is multi-day work — explicitly broken into 7 phases (H3-H9) so each ships independently and proves value before the next.

## Why now

Foundation is solid. As of H2:
- DetectionRule is a first-class entity (5 kinds × polymorphic source provenance)
- Generators emit YARA/Suricata/Sigma from hunt artifacts
- Sigma baseline (10 rules per tenant) is seeded
- /rules + /rules/:id viewable, filterable, fulltext-searchable

What's missing for BSSN production:
- Custom TTP workflows (Stage 2 markup from earlier discussion)
- Generated rules can't leave Helyx — no STIX, no MISP, no webhook
- Imports limited to Sigma seed; can't ingest external CTI feeds operationally
- No download/zip even for self-service deploy

Without H3-H9, Helyx generates rules that can only be viewed inside Helyx. With them, Helyx becomes a real participant in the CTI ecosystem.

---

## Scope per phase

### H2 follow-ups (deferred from earlier session)

**H2.1 Markup UI** — graph node tagging, tabular markup tab on hunt detail.
**H2.2 Download zip** — pack rules from a hunt as `<name>-rules.zip` containing yara/suricata/sigma/ subdirs + manifest.json.
**H2.3 OTX pull-on-demand** — graph search modal gets "OTX" tab (live AlienVault search), results add as :DetectionRule kind=imported source=otx.

**Total H2 follow-ups: ~5h**

### H3 — TTP-seed hunt flow

User flow: "I want to hunt T1486 (Data Encrypted for Impact) across my stakeholders." Helyx materializes:
- All :Stakeholder owned by current org → graph nodes
- All :CVE that detect this T-code (via existing :DetectionRule rules with :DETECTS edges)
- All :Artifact in cases tagged with this T-code (via existing audit log? or per-case TTP field)

Backend:
- `materializeTtpHunt(techniqueId: ID!): GraphSnapshot!` mutation — builds hunt-shaped JSON without persisting; user reviews, then "Save as Hunt" persists
- Repo helper `findEntitiesForTechnique(tenantId, techniqueId)` traversing CVE.detects + Artifact.tags

Frontend:
- New entry point: `/graph?ttp=T1486` populates canvas from materialize() then opens save modal
- Custom TTP picker (typeahead on AttackPattern.externalId or .name) on /hunts list page

Effort: ~3h

### H4 — Markup UI (full Stage 2 from earlier discussion)

Two markup surfaces:

**Graph node markup** — right-click any node in /graph or /hunts/:id:
- "Mark as detection source" → tag = `source-ioc` → border tinted gold, badge in node label
- "Mark as deploy target" → tag = `deploy-target` → asset becomes deploy candidate
- "Group as malware family" → multi-select then prompt for family name → all selected nodes get `family:<name>` tag
- Tags persisted in graphSnapshot.nodes[].data.tags array

**Tabular markup tab** — separate view at `/hunts/:id/markup` (or modal):
- Lists all artifacts/IOCs/TTPs in the hunt as rows
- Per-row checkboxes: source-ioc, deploy-target, group-name dropdown
- Bulk-select + apply to many rows at once
- Useful when graph has 100+ nodes; clicking each one is painful

Effort: ~4h (graph markup 2h + tabular tab 2h)

### H5 — STIX 2.1 export

Export a Hunt as STIX 2.1 bundle (JSON, downloadable). Bundle contains:
- 1 × Identity (the active org as the `created_by_ref`)
- N × Indicator (one per :DetectionRule of kind YARA/SURICATA/SIGMA in the hunt)
- N × AttackPattern (one per :AttackPattern in the hunt — external_references = MITRE)
- N × ThreatActor (one per :ThreatActor in the hunt — future)
- N × Sighting (when rule fires — future, deferred)
- N × Relationship (typed: detects, indicates, attributed-to, targets)

Backend: `src/exporters/stix.ts` — pure function `huntToStixBundle(hunt, dependentEntities) → StixBundle`.

GraphQL: `exportHuntAsStix(id: ID!): String!` returns JSON-encoded bundle; or `exportHuntAsStixDownload(id: ID!)` REST endpoint with Content-Disposition for direct browser download.

Validation: validate output via `@stix/stix2-validator` npm package OR a hand-rolled minimal validator. Reject if STIX 2.1 spec violations.

Effort: ~5h (mapping + validator + UI button + tests-when-runner-lands)

### H6 — STIX 2.1 import + OTX pull

**STIX import**: `mutation importStixBundle(content: String!): ImportStats!`
- Parse STIX bundle JSON
- Map STIX objects → Helyx entities (idempotent on stix_id):
  - Indicator → DetectionRule (kind from `pattern_type`: yara/sigma/snort)
  - AttackPattern → :AttackPattern (skip if already in catalog)
  - ThreatActor → :ThreatActor
  - Identity → :Stakeholder (with isOperator=false initially)
- Stats: counts per entity type imported, duplicates skipped, errors

**OTX pull**: `query searchOtxPulses(q: String!, first: Int = 10): [OtxPulse!]!`
- AlienVault OTX free API: `https://otx.alienvault.com/api/v1/pulses/subscribed` and `/api/v1/search/pulses?q=<query>`
- Auth: `X-OTX-API-KEY` header (free tier sign-up)
- Map pulse IOCs → preview shape (no auto-import; user picks which to import)

UI:
- New STIX import drop zone at `/rules` ("Drop STIX bundle here")
- "OTX" tab in graph search modal — search by query, click pulse → import selected IOCs as artifacts/rules

Effort: ~5h (parsers + API client + UI)

### H7 — MISP push + OpenCTI push

Two CTI platforms, similar pattern (REST/GraphQL, push hunt as event/bundle).

**MISP**: `mutation pushHuntToMisp(huntId: ID!, mispUrl: String, mispKey: String): PushResult!`
- POST to `<mispUrl>/events` with hunt-shaped JSON
- Map: Hunt → Event, IOCs → Attributes, Tags → MISP tags
- Return: misp_event_id + URL

**OpenCTI**: `mutation pushHuntToOpenCti(huntId: ID!, openctiUrl: String, openctiKey: String): PushResult!`
- GraphQL mutation to OpenCTI's `mutation { reportAdd(input: ...) }`
- Map: Hunt → Report (entityType), Artifacts → linked Indicators, AttackPatterns linked

Config: per-tenant MISP/OpenCTI URL+key stored in `auth:cti:<tenantId>` Redis (encrypted at rest? — TBD).

Effort: ~6h (2 platforms × MISP/OpenCTI client + UI form for credentials + push button)

### H8 — Webhook deploy (Wazuh + Suricata reload)

**Wazuh**: push Sigma rule to Wazuh manager's API (custom rule directory):
- `POST /security/rules/files/<filename>` with rule content
- Deployment status tracked: `:DetectionRule { wazuhDeployedAt, wazuhDeployedTo, wazuhRuleId }`

**Suricata**: reload Suricata config after pushing new rules:
- Custom Helyx-managed rules dir (`/etc/suricata/rules/helyx-<tenant>.rules`)
- POST rule batch via SCP/rsync to manager OR webhook to a Helyx agent
- Trigger reload via `kill -USR2 <pid>` or `suricatasc -c reload-rules`

Tracked: `:DetectionRule { suricataDeployedAt, suricataReloadedAt }`.

Effort: ~5h (Wazuh client + Suricata client + status UI)

### H9 — EclecticIQ + custom STIX-TAXII server

**EclecticIQ**: similar to MISP/OpenCTI push but proprietary REST API. Map Hunt → EIQ "Entity" with relationships.

**STIX-TAXII server**: standard TAXII 2.1 push to any compliant server. Bundle from H5 + TAXII envelope.

Effort: ~4h (2 platforms × thin clients)

---

## Cumulative effort

```
H2.1 Markup UI                  4h
H2.2 Download zip               1h
H2.3 OTX pull-on-demand         3h    [overlaps H6 — defer to H6 to avoid dup]
H3 TTP-seed                     3h
H4 Markup UI (graph + tabular)  4h    [overlap with H2.1 — merged]
H5 STIX export                  5h
H6 STIX import + OTX pull       5h
H7 MISP + OpenCTI push          6h
H8 Webhook deploy               5h
H9 EclecticIQ + TAXII           4h
─────────────────────────────────
Total                          ~37h (≈4-5 days CC time)
```

H2.1 + H4 merged (markup UI). H2.3 + H6 merged (OTX). Net unique: ~33h.

---

## Architecture sketch

```
                    ┌──────────────┐
                    │ MITRE ATT&CK │ ─→ catalog (existing m008)
                    └──────────────┘
                            ↓
                    Custom TTP picker (H3)
                            ↓
                    ┌────────────────┐
                    │ Helyx Hunt     │ ←→ Graph view (G1+G2)
                    └────────────────┘
              ↑           ↑            ↓
              │           │            ↓
   STIX import (H6)  OTX (H6)   generateRulesFromHunt (H2)
              │                        ↓
              │            ┌─────────────────┐
              └──────────→ │ DetectionRule   │ ←─── Sigma library (H1)
                           └─────────────────┘
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
            CTI push (H7/H9)              Deploy push (H8)
            ┌──────┴──────┐                ┌──────┴──────┐
            ↓             ↓                ↓             ↓
          MISP        OpenCTI            Wazuh       Suricata
          EclecticIQ  TAXII server                   (other SIEM)
                                                          ↓
                                                 ┌───────────┐
                                                 │ STIX bundle (H5) │
                                                 │ download / API   │
                                                 └───────────┘
```

---

## What's NOT in scope

- **MISP/OpenCTI bidirectional auto-sync** — push only in H7. Pull comes via STIX import (H6) which user invokes manually. Background sync = Phase later.
- **Sighting feedback loop** — when Wazuh detects via a Helyx rule, push back to Helyx as :Sighting. Phase later (needs SIEM webhook ingress).
- **Rule editor UI** (Monaco) — Phase H10 polish. Current /rules/:id is read-only.
- **Rule version history / diff** — Phase H10.
- **Detection hit dashboard** — needs Sighting first.
- **Multi-stakeholder rule sharing** (one stakeholder shares its Helyx-generated rules with another) — federation pattern, late-stage.
- **STIX-TAXII server** that Helyx hosts (so external clients pull from Helyx) — H9 covers Helyx-as-client; Helyx-as-server is later.
- **Custom Sigma rules editor with Sigma-CLI conversion** to backend-specific (Wazuh, Splunk, ELK queries) — defer until Wazuh deploy works.

---

## Risks (initial draft, will be expanded by review)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | STIX 2.1 spec compliance — Helyx's bundle could fail validation in MISP/OpenCTI | HIGH | Validate via npm package + manual testing against MISP test instance |
| 2 | OTX free tier rate limit (10k/day) hit fast on repeated searches | MEDIUM | Cache OTX results in Redis 1h TTL; show counter in UI |
| 3 | MISP/OpenCTI auth keys stored encrypted vs plaintext in Redis | HIGH | Use AES-256-GCM with key from JWT_SECRET-derived key; document rotation |
| 4 | Wazuh rule push needs ssh/scp credentials — secret sprawl | HIGH | Make this an explicit "Deploy" mutation that takes creds per-call; no persistent storage |
| 5 | TTP-seed materialize() returns 1000+ assets for popular techniques (T1059, T1027) | MEDIUM | Cap at 200 nodes (graph cap); offer "drill into sub-stakeholder" for filtering |
| 6 | STIX import dedup edge case — two STIX bundles claim different metadata for same indicator | MEDIUM | MERGE on stix_id; LATER-WRITE-WINS for conflicting fields; log warning |
| 7 | Markup tags persist in graphSnapshot JSON — schema drift if format changes | LOW | Version field in snapshot JSON; migration code on read |

---

## Phasing recommendation

**MVP demo path (1-2 sessions):**
1. H4 markup UI — already discussed, prerequisite for serious hunts
2. H2.2 download zip — no-API self-service deploy
3. H5 STIX export — produces shareable artifacts even without push integration

After MVP demo: assess feedback, then pick H6 (import) or H7 (push) based on which CTI platform the operator already uses.

**Operational path (1-2 weeks):**
- All 7 phases in order
- Smoke verify after each
- Real Wazuh/MISP integration test before declaring complete

---

## Decision points needed before execute

**D1**: H2.1 markup UI vs H4 markup UI — same thing, different effort estimate. Confirm we collapse to H4.

**D2**: Storage of MISP/OpenCTI/EclecticIQ creds — encrypted-at-rest in Redis (more setup, more secure) OR per-call user-provided (simpler, more friction)?

**D3**: STIX export — full subset (Indicator+AttackPattern+ThreatActor+Identity+Relationship+Bundle) for H5, OR minimal (Indicator+Bundle only) for fast ship?

**D4**: Wazuh deploy mechanism — direct API call from Helyx backend (clean) OR generate config snippet for operator to scp/curl manually (zero secrets in Helyx)?

**D5**: TTP-seed materialize cap — 200 nodes hard cap (matches graph cap) or 50 nodes default + "load more" button?

---

## /autoplan Review — Phase 1: CEO Voices

**Status:** subagent-only (codex 402 — workspace deactivated). Single-reviewer mode for all phases.

### CEO Consensus (subagent-only)

| Dimension | Subagent | Consensus |
|---|---|---|
| 1. Premises valid? | WEAK on premise #1 (CTI exchange = right goal); WRONG on premise #2 (claimed bidirectional, actually push-only); WEAK on STIX as primary lingua | **DISAGREE → premise gate** |
| 2. Right problem to solve? | Sighting feedback loop is 10x; H5-H9 builds write-only CTI | **REVISE — promote Sighting to MVP** |
| 3. Scope calibration correct? | 33h is wrong, real 60-80h. Cut to 35-45h via deferrals (OpenCTI, EIQ, TAXII, encrypted creds) | **CUT** |
| 4. Alternatives sufficiently explored? | NO — STIX vs MISP-native vs Helyx-canonical not weighed; per-call creds vs encrypted-at-rest vs Vault not weighed; Wazuh API vs config-snippet vs operator-pull not weighed | **DISAGREE** |
| 5. Competitive risk covered? | NO — H5-H9 reaches commodity parity, ignores the wedge (graph fusion + multi-SIEM Sigma-CLI) | **DISAGREE** |
| 6. 6-month trajectory sound? | 5 specific regret scenarios with probabilities; 2 are >70% likely | **REVISE** |

### Critical concerns reconfirmed (3 from prior subagent review)

1. **H8 Wazuh deploy = no kill switch** → drop direct push for MVP; require config-snippet-only path; add `:DetectionRule { deploymentMode }`; track per-rule rollback Cypher.
2. **Encrypted creds via JWT_SECRET = wrong layering** → use per-call user-provided creds for MVP; if persistence needed later, use separate `CTI_CREDS_KEY` env var, never derive from JWT_SECRET.
3. **Audit log integration missing from H5-H9** → mandatory per CLAUDE.md security baseline (`audits/log.ts` exists, must wire `cti.push.misp`, `rule.deploy`, `cti.export.stix`, `ttp.materialize`, etc.)

### High concerns reconfirmed + sharpened

- **STIX 2.1 validator npm doesn't exist** — pick the hand-rolled JSON-Schema validator path now (line 91 said "OR"); don't pretend npm has it.
- **MISP push** must address galaxy/dedup/sharing-group: add `misp_event_uuid` to `:Hunt`; reuse-or-create event semantics; map TTPs to MISP galaxy `mitre-attack-pattern` UUIDs.
- **OpenCTI GraphQL brittleness** — pin to OpenCTI 6.x + version-detect on connect, OR DEFER (recommended).
- **TTP-seed scale (UPGRADED to CRITICAL)** — pagination + count-first; hard cap is silent data loss. Show "1,847 matches — refine by Actor / Stakeholder / date" before any node renders.
- **Custom TTP intent mismatch** — H3 missing Actor JOIN per owner's earlier spec ("TTP from Actor B"); confirm with owner before H3 ships.

### NEW findings (post-WET refactor + CLAUDE.md re-read)

1. **`kinds.ts` DRY pattern not extended.** H7-H9 introduce push targets (MISP, OpenCTI, Wazuh, Suricata, EIQ, TAXII) with no central enum. Same WET trap that just got fixed in WET-1. Add `CTI_PLATFORMS` and `DEPLOYMENT_TARGETS` const arrays in new `apps/backend/src/cti/kinds.ts` BEFORE writing types/schema/composables.
2. **Schema collision risk.** Name candidate `CtiPlatform` (not `Source`) — `RuleSource` already exists for provenance; don't reuse semantically. Same lesson as RuleSource ↔ DetectionEngine collision fixed in WET-2.
3. **`hunts/repo.ts` is 406 lines** — already at 80% of CLAUDE.md's "split early" target. Adding `materializeTtpHunt` Cypher pushes past 500. Factor `hunts/materialize.repo.ts` BEFORE H3 starts.
4. **No DataLoader for H6 STIX import.** A 500-indicator bundle = 500 MERGE roundtrips. Use UNWIND batching like `sources/nvd/ingest.ts`. Non-negotiable per CLAUDE.md "No N+1".
5. **Tenancy never mentioned for MISP/OpenCTI creds, OTX results, STIX imports.** Every imported `:DetectionRule` MUST carry `tenantId` per CLAUDE.md tenant data discipline. Plan silent on this — add to every H5-H9 task.
6. **`exporters/index.ts` pattern reuse** — H5 STIX must follow the existing yara/suricata/sigma exporter shape. Plan doesn't reference the existing slot.
7. **`audits/log.ts` wiring** — every H5-H9 mutation needs `logAudit()`. Plan never mentions it.

### Premise gate — REQUIRES USER DECISION

Subagent challenges premise #1: **CTI ecosystem participation is the right Phase 4 goal.**
Counter: Sighting feedback (currently OUT-of-scope per line 219) is the 10x feature. Without it, Helyx is write-only CTI — pushes 40 rules to MISP, gets zero signal back, can't answer "did the rule fire?", operators ask "why use Helyx vs MISP directly?"

This is a **User Challenge** (both prior + new subagent review converge on this). Surfacing to user.

### Mode-specific scope decisions (subagent recommendations)

| Item | Subagent verdict | Rationale |
|---|---|---|
| H2.2 zip download | IN | 1h, immediate self-serve deploy |
| H4 markup UI | IN | Owner-stated prerequisite |
| H3 TTP-seed (with Actor JOIN added) | IN | Fix owner spec mismatch first |
| H5 STIX export (minimal: Indicator+Bundle only) | IN | Ship MVP STIX, defer Identity+Relationship+ThreatActor to TODOS |
| H6 OTX pull | IN | Isolated, high-value |
| H6 STIX import | DEFER TODOS | Push-first, pull when sighting exists |
| H7 MISP push (per-call creds, MISP-native JSON not STIX) | IN | Drop encrypted-at-rest scope |
| H7 OpenCTI push | DEFER TODOS | GraphQL brittleness; ship after MISP works |
| H8 Wazuh (config-snippet only) | IN | Drop direct API push (CRITICAL kill-switch issue) |
| H8 Suricata reload | DEFER TODOS | SCP+USR2 = ops-team turf |
| H9 EclecticIQ + TAXII | OUT FOREVER (this phase) | No demand signal |
| **Sighting feedback** | **PROMOTE TO IN** | The actual 10x feature |
| Audit log integration H5-H9 | IN (mandatory) | CLAUDE.md security baseline |
| Rule lifecycle promotion (DRAFT→ACTIVE) | IN (folded into H4) | DEPRECATED enum exists but no owner |


### Premise gate — RESOLVED

**Decision (user, 2026-05-11):** Keep original scope. All H3-H9 as written. Sighting deferred to later phase per the "What's NOT in scope" section (line 219).

User has context the models lack. Premise stands. **However**, the CRITICAL + HIGH technical findings are independent of strategic direction and remain mandatory revisions before execute.

### Phase 1 conclusion

**PHASE 1 COMPLETE.** Codex: [codex-unavailable]. Claude subagent: 7 NEW + 14 confirmed/sharpened findings. Consensus: 6/6 dimensions show DISAGREE (single-reviewer, no second voice for true consensus). Premise gate passed (user override). Passing to Phase 2 (Design).


---

## /autoplan Review — Phase 2: Design Voices

**Status:** subagent-only (codex 402).

### Design Litmus Scorecard

| Dimension | Score | Top finding |
|---|---|---|
| 1. Information hierarchy | 2/10 | No surface specifies what user sees first |
| 2. Missing states | 1/10 | 0 of 39 distinct states specified across 8 surfaces |
| 3. Emotional arc | 2/10 | "Generate-zero cliff" + "push-into-void cliff" unaddressed |
| 4. Specificity | 2/10 | All 8 surfaces are nouns ("modal", "tab"), not specs |
| 5. Design system alignment | 3/10 | Existing primitives unnamed; needed primitives unnamed |
| 6. Detail-page-as-graph-hub | 1/10 | 4 violations (StixExport, StixImport, MispPush, RuleDeployment all treated as fire-and-forget) |
| 7. Keyboard / a11y | 2/10 | Inbox J/K/1/2/3 precedent ignored for markup tab |
| **Overall** | **1.9/10** | **Design pass mandatory before execute** |

### Top 3 design risks (will haunt the implementer)

1. **Generate-zero cliff (H4 → H2 boundary)** — User marks 50 IOCs, hits Generate, gets 0 rules because purl/pattern_type missing. Owner watching the demo sees broken software. **Fix:** every markup row carries pre-flight rule-yield chip (`→ 1 yara · 0 sigma · 0 suricata`). Computed in resolver, cached per-component. Add to H4 backend scope (~1h extra).

2. **Detail-page-as-graph-hub violation × 4** — Plan treats StixExport, StixImport, MispPush, RuleDeployment as fire-and-forget actions. CLAUDE.md is explicit: "no terminal state." Need 4 new detail-page views (`/exports/:id`, `/imports/:id`, `/cti/pushes/:id`, `/deployments/:id`) — each surfacing source Hunt + included rules + target platform + audit trail. ~6h extra not in plan.

3. **Markup tab keyboard parity gap** — Inbox set J/K/1/2/3 standard. Markup tab is higher-volume; shipping mouse-only is the design failure that gets the loudest owner reaction. Make keyboard map a §H4 acceptance criterion. Race-guard pattern from `ReconciliationInboxView.vue:99-138` is copy-pasteable.

### Mandatory design-system prerequisites BEFORE H4

- Extract `<Slideover>` from `CreateStakeholderSlide.vue` (reused by H6/H7/H8).
- Build `<DataTable>` shell (reused by markup tab + H6 import preview).
- Build `<CodeBlock>` (reused by H8 snippet display + H10 rule editor).
- Build `<PersistentActionBar>` (reused by H3 footer + H4 bulk action bar).

Without these extractions, design system fragments — owner will reject.

### Specific UI specifications added by design pass

| Phase | Surface | Concrete spec |
|---|---|---|
| H3 | TTP picker | `Input.vue` + new `useTtpTypeahead`. Render results as `RawStakeholderRow`-shape: T-code mono left, name middle, "actor count · cve count" right. J/K + Enter. |
| H3 | materialize landing | Replace modal with persistent footer bar (`fixed bottom-0 border-t border-rule-strong px-12 py-3`); count chip + Refine / Save / Discard. |
| H4 | graph context menu | Order: 1. Mark as detection source · 2. Mark as deploy target · 3. Group as malware family · separator · 4. Pin · 5. Hide. Disabled rows for incompatible types with tooltip. Extend existing `ContextMenu.vue` Transform[] pattern. |
| H4 | tabular markup | Columns: `[checkbox] · type-pigment-dot · name (mono) · purl/value (truncate) · marks (3 toggle chips: SRC/DEP/GRP) · → preview chip ("1 yara · 0 sigma")`. Default sort: unmarked first. Sticky `<thead>`. Bulk action bar slides up from bottom when ≥1 selected. |
| H5 | STIX export trigger | New `<SectionRule label="export">` on HuntDetailView. Button "download STIX 2.1" + `font-mono text-[10px]` line listing entity counts in bundle. |
| H6 | OTX modal | Reuse `<Slideover>`. Search input top, rate-limit countdown right of input, results as expandable rows, "import N selected" CTA fixed at footer. |
| H7 | push modal | Two-section slide-over: "Push target" radio (saved configs OR new connection), "Will push" preview list. Push CTA primary; creds collapsed when saved connection picked. |
| H8 | deploy snippet | New `<CodeBlock>`: filename header, copy button, JetBrains Mono body, no syntax highlighting (forensic-ledger discipline). Below: scp/curl one-liner. |

### Phase 2 conclusion

**PHASE 2 COMPLETE.** Codex: [codex-unavailable]. Claude subagent: 1.9/10 + 4 mandatory prerequisites + 8 surface specs + 39 missing-state cells. Design pass blocks execute. Passing to Phase 3 (Eng).


---

## /autoplan Review — Phase 3: Eng Voices

**Status:** subagent-only (codex 402).

### Eng Consensus Table

| Dimension | Subagent verdict |
|---|---|
| Architecture coherence | DISAGREE — circular risk `cti/` ↔ `stix/`; `cti/sources/otx` collides with established `src/sources/` ingestion convention |
| Code quality (DRY/file ceiling) | DISAGREE — `hunts/repo.ts:406` over comfort; H3 push past 500 |
| Test strategy | DISAGREE — STIX validator + Wazuh XML escape + STIX import idempotency are non-deferrable |
| Performance / N+1 | DISAGREE — H6 import + H4 rule-yield preview both N+1 as drafted |
| Security | DISAGREE — STIX bomb, IOC XML injection, audit hooks unmapped, SSRF on H7 platform URLs |
| Deployment safety | WEAK — 5 migrations needed (m017-m021); zero filenames in plan |

### Architecture (key finding)

`cti/sources/otx` collides semantically with `apps/backend/src/sources/` (the established NVD/ELK ingest convention). Pick one path. Mandated: extend `src/sources/otx/` (consistent precedent), put push targets under `cti/`, keep `stix/` as a pure mapping module with no Helyx-domain imports.

### File Ceiling Risk

| File | Current | After H | Action |
|---|---|---|---|
| `hunts/repo.ts` | 406 | +200 (H3+H4) | **SPLIT before H3** → `materialize.repo.ts` + `markup.repo.ts` |
| `rules/repo.ts` | unknown | +deploy fields | likely SPLIT → `rules/deploy.repo.ts` |
| (NEW) `cti/misp.ts` | 0 | full client+mapper | preempt SPLIT → `misp/client.ts` + `misp/mapper.ts` |
| (NEW) `stix/export.ts` | 0 | bundle assembly | preempt SPLIT → `stix/objects.ts` + `stix/bundle.ts` |

### Non-deferrable tests (despite "no test runner yet")

Three places where deferred-tests stops being acceptable:
1. **STIX bundle JSON-Schema validation** against OASIS canonical fixtures — without this, MISP/OpenCTI silently reject our bundles. Stand up `vitest` scoped to `stix/__tests__/oasis-fixtures/`.
2. **Wazuh XML escape corpus test** — IOC name `</rule><rule>...` injection is real. ~10-payload corpus.
3. **STIX import idempotency** — broken stix_id dedupe = duplicate rules forever.

Three folders, ~20 tests. Doesn't require the broader runner-rollout the owner deferred.

### Performance Risk Register

| Surface | N+1 risk | Mitigation |
|---|---|---|
| H3 materializeTtpHunt(T1059) | thousands of CVE/asset bridges; cap=200 = silent loss | Count-first Cypher → facet panel → fetch only after refine |
| H4 rule-yield preview chip | per-component re-compute on every keystroke | `cacheWrap('rule-yield:<purl>:<sha>', 300, ...)` per `cache/index.ts` |
| H6 STIX import | 500 indicators = 500 MERGE roundtrips | Mandatory UNWIND batching per `sources/nvd/ingest.ts:7-137` shape |
| H7 push | 100 rules = 100 attribute POSTs | Use platform batch endpoint + single-flight per hunt+platform |
| H8 deploy status | per-row resolver fetch on /rules grid | DataLoader `wazuhStatusByRuleIdLoader` |

### Security Threat Model

| Surface | Threat | Mitigation |
|---|---|---|
| H6 STIX import | JSON-bomb (50MB), recursion, prototype pollution | 5MB body cap, schema-validate BEFORE map, reject `__proto__`, cap object count 5000 |
| H7 creds in GQL body | Pino logs leak `mispKey`/`openctiKey`/`wazuhSshKey` | Add to pino redact paths in `observability/logger.ts` (CLAUDE.md V8 pattern) |
| H8 Wazuh XML | IOC newline / `]]>` / `<rule>` injection | XML-escape; reject `\n` in name; reject `]]>` substring; corpus test |
| H7 OpenCTI URL | SSRF — internal `http://169.254.169.254/...` | Allowlist scheme + reject RFC1918/link-local on resolve |
| H5 STIX export | Tenant data leak via stakeholder Identity blocks | Every Cypher in `stix/export.ts` includes `WHERE n.tenantId = $tenantId` |
| H3 materialize | Cross-tenant leak via global `:CVE` joined to tenant `:Stakeholder` | Required `tenantId` arg + lint rule rejecting `:Stakeholder` MATCH without filter |

### Hidden Complexity Callouts

1. STIX 2.1 ≠ "JSON with a spec" — relationship type constraints, marking-definitions, identity ref chains. Rename H5 to **"STIX 2.1 indicator subset"** to manage expectations. **+2h.**
2. MISP push real cost = 8-9h (not 6h) — `Event.distribution`, `threat_level_id`, `Org.uuid`, sharing groups, galaxies. **+3h.**
3. OpenCTI workflow IDs + marking-definitions + introspect-on-connect — concur with DEFER recommendation.
4. Wazuh `local_rules.xml` ordering + sid uniqueness + restart-required vs reload — manager restart needed (not just `kill -HUP`). **+2h + operator runbook.**
5. Suricata USR2 race during multi-rule push — needs staging-file + atomic rename. Per plan, rightly DEFERRED.
6. `graphSnapshot` tag schema drift (plan risk #7) — UPGRADE to MEDIUM. Add `snapshot.version` field + `migrateSnapshot()` helper in `hunts/snapshot/migrate.ts`. **+1h.**

### NEW findings beyond CEO + Design

1. **No `cti/repo.ts` proposed** — every other domain has `repo.ts` + `resolvers.ts` per CLAUDE.md. Mandate `cti/repo.ts` skeleton in H7 PR-1.
2. **`:DetectionRule` property explosion** — 10+ deploy-target columns (mispEventUuid, wazuhDeployedAt, openctiReportId, ...). **Refactor into `(:DetectionRule)-[:DEPLOYED_TO]->(:RuleDeployment {target, externalId, deployedAt, status})` in m017** — saves m020+ later.
3. **Composite index plan missing** — `(tenantId, target)` on `:RuleDeployment` for "rules deployed to MISP for tenant X" queries.
4. **CSRF/auth for download endpoints** — H2.2 zip + H5 STIX download are GET endpoints; current csrfGuard AST-parses GraphQL only, REST bypasses. Cookie-only auth OK but audit emission on read is a side effect — handle explicitly.
5. **5 migrations across H3-H9** (m017-m021): `rule_deployment_entity`, `cti_connection_entity` (only if persistent creds path), `stix_io_entities`, `misp_opencti_push_entities`, `audit_event_indexes`. All additive. Plan never mentions a single migration filename.

### Phase 3 conclusion

**PHASE 3 COMPLETE.** Codex: [codex-unavailable]. Claude subagent: 9 ship-blocking revisions + 5 hidden complexity items + 5 new findings. Real effort 45-48h (vs 33h estimate). Passing to Phase 3.5 (DX).


---

## /autoplan Review — Phase 3.5: DX Voices

**Status:** subagent-only (codex 402).

### DX Scorecard

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | TTHW | 2/10 | 22-35 min vs <5 min target |
| 2 | API/CLI naming guessability | 4/10 | `cti:push` OK; `webhook:deploy` breaks `<source>:<action>` precedent |
| 3 | Error message quality | 1/10 | Zero error envelope spec; CSRF_* precedent ignored |
| 4 | Documentation findability | 2/10 | No `docs/operators/`; no Wazuh runbook |
| 5 | Upgrade path | 5/10 | m017-m021 promised but unnamed; `:RuleDeployment` deprecation plan absent |
| 6 | Dev environment friction | 2/10 | 6+ env vars, no `.env.example`, no boot validation |
| 7 | Escape hatches | 4/10 | Existing yara/suricata/sigma exporters available but undocumented as fallback |
| 8 | Magical moment | 3/10 | "Hunt → MISP → partner sees in 2s" dream; plan fragments across 7 phases without a Phase 0 demo flow |
| **Overall** | | **2.9/10** | DX pass cheap to fix; mandatory before execute |

### Friday-4pm SOC analyst empathy (200-word excerpt)

> Friday 4pm. BSSN gave me CVE-2026-12345, asked me to push a YARA + Sigma to 3 partner agencies via MISP by EOD. I `pnpm dev`, build a hunt, mark IOCs, hit Generate. Cool — 3 rules. Click "Push to MISP", modal asks for `mispUrl` and `mispKey`. Paste, click. Spinner. "Push failed." No code. No retry. No "did it auth fail or did the bundle reject." Network tab: `code: INTERNAL_SERVER_ERROR`. Useless. I curl MISP directly with the same key — works. So Helyx is mangling something. Where do I look? `docs/`? Empty. `README`? NVD sync only. CLAUDE.md? 600 lines of architecture, not operator help. **Helyx generated value in 90 seconds and burned it in 30 minutes of debugging.** Tomorrow I'll just use MISP directly.

### DX Implementation Checklist (concrete, non-deferrable adds)

**`package.json` scripts (mirror `nvd:sync` shape from `apps/backend/src/sources/nvd/cli.ts`):**
- `cti:export --hunt-id X --format stix|json|zip --out ./bundle.json`
- `cti:push --hunt-id X --target misp|opencti --dry-run`
- `webhook:deploy --rule-id X --target wazuh|suricata --snippet-only`
- `otx:search --q lockbit --limit 50`

Each CLI: `--help` flag, exit code 1 on failure, structured pino log on success.

**`.env.example` additions:**
```
OTX_API_KEY=
MISP_DEFAULT_URL=
WAZUH_MANAGER_URL=
WAZUH_SSH_USER=
CTI_DOWNLOAD_DIR=./out
```
Boot policy: warn on missing CTI envs; fail only when a resolver requiring them is called.

**`extensions.code` envelope (extends CSRF_* precedent):**
- `STIX_VALIDATION_FAILED` → `helpUrl: docs/operators/stix-errors.md#<key>`
- `MISP_AUTH_FAILED` → `helpUrl: <mispUrl>/users/view/me`
- `MISP_BUNDLE_REJECTED` → `helpUrl: dry-run with --dry-run`
- `WAZUH_SID_COLLISION` → `helpUrl: increment sidBase`
- `SSRF_BLOCKED` → `helpUrl: RFC1918 rejected, use public URL`
- `OTX_RATE_LIMITED` → `helpUrl: retryAfter shown in error`
- `CTI_NO_CONNECTION` → `helpUrl: upsertCtiConnection mutation`

**Docs to create (currently absent):**
- `docs/operators/cti-push-runbook.md` — Wazuh snippet → restart flow
- `docs/operators/stix-errors.md` — every STIX validator code with fix
- `docs/operators/quickstart.md` — TTHW path: 5 commands to first MISP push

**Phase H5.5 magical-moment demo:** scripted 90-second flow (seed → hunt → STIX export → MISP push → partner dashboard) as smoke check at end of H7. Without this, 7 phases never converge into a "wow."

### Phase 3.5 conclusion

**PHASE 3.5 COMPLETE.** Codex: [codex-unavailable]. Claude subagent: 2.9/10 DX + 4 CLI files + 6 env vars + 7 error codes + 3 docs + 1 demo flow. Cheap fixes; binding constraint on TTHW is Sighting deferral (out-of-scope). Passing to Phase 4 (Final Gate).

---

## /autoplan Review — Cross-Phase Themes

Concerns that appeared in 2+ phase reviews independently — high-confidence signals.

| Theme | Phases | Convergent finding |
|---|---|---|
| **Detail-page-as-graph-hub violation** | CEO + Design + DX | StixExport, StixImport, MispPush, RuleDeployment, OTX search results all treated as fire-and-forget actions. CLAUDE.md explicit: "no terminal state". Need 4 entity types + 4 detail pages + audit log + GraphQL query for each. ~6h not in plan. |
| **kinds.ts DRY pattern not extended** | CEO + Eng | H7-H9 introduce CTI platforms + deployment targets without `cti/kinds.ts`. Same WET trap just refactored. Mandate `apps/backend/src/cti/kinds.ts` BEFORE H7 PR-1. |
| **Audit log wiring missing from H5-H9** | CEO + Eng + DX | `audits/log.ts` exists but plan never wires it. Mandatory per CLAUDE.md OWASP ASVS L2 baseline. Actions: `cti.push.misp`, `cti.push.opencti`, `cti.export.stix`, `cti.import.stix`, `rule.deploy`, `ttp.materialize`. |
| **TTP-seed silent data loss** | CEO + Eng | T1059 / T1027 connect to thousands of CVEs. Hard cap=200 = silent data loss. Need count-first Cypher → facet panel ("1,847 matches — refine by Actor / Stakeholder / date") → fetch only after refine. |
| **Tests stop being deferrable for STIX + Wazuh + import** | Eng | 3 places where "no test runner yet" stops being tolerable. Stand up `vitest` scoped to `stix/`, `webhook/wazuh/`, `cti/sources/stix/import/`. ~20 tests, 3 folders. |
| **Generate-zero cliff (markup → generate boundary)** | Design + DX | User marks 50 IOCs, hits Generate, gets 0 rules because purl/pattern_type missing. Owner sees broken software at demo. Pre-flight rule-yield chip per markup row. ~1h backend extra. |
| **Operator runbook gap = Helyx loses the operator** | Eng + DX | Wazuh manager-restart path needs runbook (not just SCP+`kill -HUP`). Without runbook + `<CodeBlock>` + filename hints, Friday-4pm operator switches back to MISP direct. |

---

## /autoplan Review — Decision Audit Trail (auto-decisions)

| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Codex degradation matrix → all phases [subagent-only] | mechanical | n/a (infra) | codex 402 deactivated_workspace |
| 2 | CEO | Premise gate surfaced to user (not auto-decided) | premise | per skill | non-auto rule |
| 3 | CEO | Promote Sighting to MVP (subagent recommendation) | user-challenge | per skill | both reviews converged → user override → kept original scope |
| 4 | Design | Mandate Slideover/DataTable/CodeBlock/PersistentActionBar extractions BEFORE H4 | mechanical | P1 (completeness) | design system fragments otherwise |
| 5 | Design | Detail-page-as-graph-hub for 4 new entity types | mechanical | P5 (explicit) | CLAUDE.md non-negotiable |
| 6 | Eng | Split `hunts/repo.ts` BEFORE H3 (materialize.repo.ts + markup.repo.ts) | mechanical | P5 + CLAUDE.md file ceiling | already at 406/500 |
| 7 | Eng | `:RuleDeployment` node from m017, NOT `:DetectionRule` property bag | mechanical | P1 + P5 | saves m020+ refactor; ASCII graph schema-clean |
| 8 | Eng | UNWIND batching mandatory for H6 STIX import | mechanical | P3 + CLAUDE.md "No N+1" | non-negotiable |
| 9 | Eng | JSON-Schema STIX validator + OASIS fixtures (vitest scoped) | mechanical | P1 + safety | 3 folders, ~20 tests |
| 10 | Eng | Wazuh XML escape corpus test | mechanical | P1 + safety | injection threat real |
| 11 | Eng | SSRF allowlist on H7 platform URLs | mechanical | P1 + safety | RFC1918 reject |
| 12 | Eng | pino redact extension for `mispKey`/`openctiKey`/`wazuhSshKey` | mechanical | CLAUDE.md V8 | pattern exists |
| 13 | DX | 4 new CLIs in `package.json` (mirror nvd:sync) | mechanical | P5 + precedent | TTHW unblocked |
| 14 | DX | `.env.example` updated with 6 CTI envs + boot warn-don't-fail | mechanical | P3 + P5 | dev friction unblock |
| 15 | DX | `extensions.code` envelope extends CSRF_* precedent (7 codes) | mechanical | P5 + precedent | error quality unblock |
| 16 | DX | 3 operator docs (`cti-push-runbook.md`, `stix-errors.md`, `quickstart.md`) | mechanical | P1 (completeness) | runbook gap |
| 17 | DX | Phase H5.5 scripted demo (magical moment) | mechanical | P5 + magical-moment | binds 7 phases into one wow |
| 18 | All | OpenCTI push DEFER to TODOS.md (CEO + Eng converged) | taste | P3 + P6 | GraphQL brittleness; ship MISP first |
| 19 | All | EclecticIQ + TAXII OUT FOREVER this phase (CEO + Eng converged) | taste | P3 | no demand signal |
| 20 | All | 5 migrations m017-m021 named in plan | mechanical | CLAUDE.md migration discipline | additive only |


---

## /autoplan Revision — Cycle 1 (2026-05-11)

**User decision:** Reverse premise gate. Promote Sighting from "out of scope" (line 219) to MVP. Cut OpenCTI + EclecticIQ + TAXII to make room (CEO + Eng already converged on these defers). This is the "loop that compounds" identified in CEO review — without it, push-only CTI is write-only.

### Sighting scope (NEW — H10)

**Goal:** Wazuh / Suricata fires a Helyx-generated rule → POST to Helyx → `:Sighting` node persisted → dashboard answers "did rule X fire? on whose asset? when? how often?"

**Entities (new migration `m022_sighting_entity`):**
```
(:Sighting {
  id, tenantId, ts, severity,
  ruleId,             // FK → :DetectionRule.id
  sensorIdentity,     // free text from webhook (wazuh agent name, suricata sensor)
  hostAssetId,        // optional, resolved from sensorIdentity if known
  eventId,            // SIEM-side event ID for click-through
  rawEventJson,       // capped 16KB; full payload truncated with marker
  source              // 'wazuh' | 'suricata' (CTI_SIGHTING_SOURCES enum in cti/kinds.ts)
})
(:DetectionRule)-[:FIRED_AS {ts}]->(:Sighting)
(:Sighting)-[:OBSERVED_ON]->(:Asset)  // optional, when hostAssetId resolves
```

Indexes: `(tenantId, ruleId, ts)` for "rule X sightings last 7d", `(tenantId, ts)` for tenant-wide time series.

**Backend module: `apps/backend/src/sightings/`** (new feature, follow kinds.ts SoT pattern from day 1):
- `kinds.ts` — `SIGHTING_SOURCES = ['wazuh', 'suricata'] as const`
- `types.ts` — re-exports + `SightingRow` interface
- `schema.ts` — `enum SightingSource`, `type Sighting`, `query sightings`, `query sightingsByRule`
- `repo.ts` — UNWIND batch ingest (webhook may POST batches), per-rule aggregation queries
- `resolvers.ts` — assertOrgRole(VIEWER) for queries
- `webhook.ts` — Express route `POST /webhook/sighting` with HMAC-SHA256 signature header (per-tenant secret stored in `:CtiConnection`)

**Frontend (`apps/web/src/composables/sightings/`):**
- `useSightings`, `useSightingsByRule` composables
- `/sightings` view — chronological feed, filter by rule/source/severity/asset
- `/rules/:id` adds "Sightings" tab with time-series chart (sparkline of fires per day, last 30d) + recent fires list
- `/dashboard` tile: "Top 5 firing rules (24h)" + "Quietest rules (7d, candidates for tune/retire)"

**Audit:** every webhook ingress emits `sighting.ingest` audit event with sensor identity + rule.

**Effort:** ~14-16h (entity + webhook + dashboard + UI tab + chart). Mandatory tests: HMAC signature validation, UNWIND idempotency on `(ruleId, sensorIdentity, eventId)` dedup key.

### Revised scope (final, post-Cycle 1)

| Item | Status | Notes |
|---|---|---|
| H2.2 zip download | IN | 1h |
| H3 TTP-seed (with Actor JOIN added) | IN | ~5h (was 3h, +Actor JOIN + count-first facet) |
| H4 markup UI + 4 component extracts (Slideover/DataTable/CodeBlock/PersistentActionBar) | IN | ~9h (was 4h, +extracts +keyboard parity +rule-yield chip) |
| H5 minimal STIX export (Indicator+Bundle, JSON-Schema validator + OASIS fixtures) | IN | ~7h (was 5h, +validator) |
| H6 OTX pull-on-demand | IN | ~4h |
| H6 STIX import | **DEFER TODOS** | Push-first; can still receive via MISP pull pattern |
| H7 MISP push (per-call creds, MISP-native JSON, galaxies/sharing-groups, batch attribute push) | IN | ~9h (was 4h, +galaxies +SSRF +pino redact) |
| H7 OpenCTI push | **DEFER TODOS** | GraphQL brittleness; Sighting takes its slot |
| H8 Wazuh config-snippet only (CodeBlock + scp/curl one-liner + runbook) | IN | ~4h |
| H8 Suricata reload | **DEFER TODOS** | Operator turf |
| H9 EclecticIQ + TAXII | **OUT FOREVER (this phase)** | No demand signal |
| **H10 Sighting (NEW MVP)** | **IN** | ~14-16h — entity + webhook ingress + dashboard + UI tab |
| Audit log wiring (all H5-H10 mutations) | IN (mandatory) | ~2h |
| 5 migrations m017-m021 + m022 sighting | IN | ~2h |
| `cti/kinds.ts` SoT (CTI_PLATFORMS, DEPLOYMENT_TARGETS, CTI_SIGHTING_SOURCES) | IN (BEFORE H7) | ~1h |
| `hunts/repo.ts` split before H3 (materialize + markup) | IN (prereq) | ~1h |
| `:RuleDeployment` node from m017 (not property bag) | IN | folded into m017 |
| 4 detail-page-as-graph-hub views (StixExport/StixImport/MispPush/RuleDeployment) — note: StixImport drops since H6 import deferred; reduces to 3 views | IN | ~5h |
| 4 CLIs + .env.example + 7 error codes + 3 operator docs + H5.5 demo | IN | ~3h |
| 3 vitest folders (stix/, webhook/wazuh/, sighting webhook HMAC) | IN | ~3h |

**New realistic total: ~57-62h** (Sighting adds ~14-16h, OpenCTI defer saves ~9h, EIQ+TAXII defer saves ~6h, STIX import defer saves ~5h, net delta from prior 45-48h = ~+12-14h).

### What this revision unlocks (the loop CEO review pointed at)

Friday-4pm SOC analyst now:
1. Marks IOCs from a hunt → generates 3 rules
2. Pushes to MISP via H7 (MISP-only, per-call creds)
3. Deploys to Wazuh via H8 config-snippet + scp
4. **Comes back Monday and sees `/sightings` showing rules fired 47 times across 12 sensors**
5. Tunes the noisy ones, retires the silent ones — rule lifecycle owns its own outcome data

That's the feedback loop. Without it, write-only CTI. With it, Helyx becomes the only place where "did the rule fire?" is queryable across MISP-pushed + locally-generated rules.

### Re-run delta on prior phase findings

| Prior finding | Cycle-1 status |
|---|---|
| OpenCTI defer (CEO + Eng converged) | RESOLVED — deferred |
| EIQ + TAXII defer (CEO + Eng converged) | RESOLVED — deferred |
| Sighting promotion (CEO recommended) | RESOLVED — IN MVP |
| All 9 ship-blocking Eng revisions | UNCHANGED — still apply |
| All 4 mandatory Design extractions | UNCHANGED — still apply |
| All 17 mechanical auto-decisions | UNCHANGED — still apply |
| TTHW <5min target | STILL OUT OF REACH — Sighting helps but multi-step (push→deploy→fire) inherently >5min |
| Magical moment | UPGRADED — H10 Sighting + H5.5 demo flow now binds the loop |
| Migration count | NOW 6 (m017-m022) |
| `:RuleDeployment` node refactor | UNCHANGED — still mandatory in m017 |
| `cti/kinds.ts` SoT mandate | UNCHANGED + EXTENDED — now includes `CTI_SIGHTING_SOURCES` |
| Detail-page-as-graph-hub | REVISED — 4 → 3 (drop StixImport since deferred); add `/sightings/:id` view |
| `hunts/repo.ts` split prereq | UNCHANGED |

### Cycle 1 conclusion

Strategic premise reversed (Sighting promoted). 3 deferrals confirmed (OpenCTI, EIQ+TAXII, STIX import). Revised effort ~57-62h. All prior technical revisions still apply. Re-presenting gate.


---

## /autoplan Revision — Cycle 2 (2026-05-11)

**User decision:** Re-add OpenCTI push to MVP. **No cuts elsewhere** — boil the lake. Realistic effort climbs to ~66-71h.

### H7-OpenCTI restored

**Re-added scope** (was DEFER TODOS in Cycle 1):
- `apps/backend/src/cti/opencti/` module: `client.ts` (GraphQL HTTP client), `mapper.ts` (Helyx → OpenCTI entities), `introspect.ts` (boot-time schema check), `repo.ts` (`:OpenCtiPush` audit nodes)
- Pin to OpenCTI 6.x in package.json comment + version-detect on connect (fail-loud if 7.x detected with helpful error code `OPENCTI_VERSION_UNSUPPORTED`)
- Per OpenCTI semantics: every entity needs `objectMarking` (TLP), `createdBy` (Identity), `x_opencti_score`, `x_opencti_workflow_id`. Include in mapper.
- Push GraphQL mutation: `pushHuntToOpenCti(huntId, openCtiUrl, openCtiToken)` — per-call creds, SSRF allowlist applies
- Audit: `cti.push.opencti` action, target `:OpenCtiPush {id, huntId, ts, externalId, status}`
- Detail page: `/cti/pushes/:id` already covered (the 4 → restored to 4 detail pages)
- pino redact: `openCtiToken` added (already in WET-prep checklist)
- CLI: `pnpm cti:push --target opencti --dry-run` already in DX checklist (was multi-target from day 1)

**Effort:** ~9h (5h core push + 2h introspection/version-detect + 1h mapper edge cases + 1h tests against recorded OpenCTI fixtures).

### Revised final scope (post-Cycle 2)

| Item | Status | Effort |
|---|---|---|
| H2.2 zip download | IN | 1h |
| H3 TTP-seed (with Actor JOIN, count-first facet) | IN | 5h |
| H4 markup UI + 4 component extracts + keyboard parity + rule-yield chip | IN | 9h |
| H5 minimal STIX export + JSON-Schema validator + OASIS fixtures | IN | 7h |
| H6 OTX pull-on-demand | IN | 4h |
| H6 STIX import | DEFER TODOS | (kept deferred — push-first; can still receive via MISP pull pattern) |
| H7-MISP push (per-call creds, MISP-native JSON, galaxies/sharing-groups, batch attribute) | IN | 9h |
| **H7-OpenCTI push (RESTORED Cycle 2)** | **IN** | **9h** |
| H8 Wazuh config-snippet + CodeBlock + scp/curl one-liner + runbook | IN | 4h |
| H8 Suricata reload | DEFER TODOS | (operator turf) |
| H9 EclecticIQ + TAXII | OUT FOREVER (this phase) | — |
| H10 Sighting (entity + webhook + dashboard + UI tab) | IN | 14-16h |
| Audit log wiring (all H5-H10 mutations: `cti.push.misp`, `cti.push.opencti`, `cti.export.stix`, `rule.deploy`, `ttp.materialize`, `sighting.ingest`) | IN | 2h |
| 6 migrations (m017-m022) | IN | 2h |
| `cti/kinds.ts` SoT (CTI_PLATFORMS, DEPLOYMENT_TARGETS, CTI_SIGHTING_SOURCES, OPENCTI_TLP_MARKINGS) | IN (BEFORE H7) | 1h |
| `hunts/repo.ts` split before H3 | IN (prereq) | 1h |
| `:RuleDeployment` node from m017 | IN | (folded into m017) |
| 4 detail-page-as-graph-hub views (StixExport / MispPush / OpenCtiPush / RuleDeployment) — Sighting gets its own tab | IN | 5h |
| 4 CLIs + .env.example + 7 error codes + 3 operator docs + H5.5 magical-moment demo | IN | 3h |
| 3 vitest folders (stix/, webhook/wazuh/, sighting webhook HMAC) | IN | 3h |

**New realistic total: ~66-71h.**

(Sighting +14-16h, OpenCTI re-add +9h vs Cycle 1's 57-62h. EIQ+TAXII still OUT, STIX import still deferred.)

### What this delivers (the BSSN demo flow, end-to-end)

Friday-4pm SOC analyst lifecycle:
1. **TTP-seed (H3):** Picks T1486 with Actor JOIN ("APT38 ransomware"). Count-first shows "1,847 matches → refine"; refines to 23 critical assets across 4 stakeholders. Saves as Hunt.
2. **Markup (H4):** 50 IOCs in graph. Right-click 38 of them → "source-ioc". Pre-flight chip shows "→ 27 yara · 12 sigma · 5 suricata".
3. **Generate + Export (H5):** Generates 44 rules. Hits "Download STIX bundle" → 1 STIX 2.1 file with 44 indicators + 23 attack-pattern relationships. Validator green.
4. **Push (H7):** Opens Push slide-over. Picks MISP, pastes mispKey. "Push 44 indicators to MISP event helyx-2026-05-11-001 ?" → confirms. 38 new attrs · 6 already existed · 0 failed. Click-through to MISP event URL.
5. **Push (H7-OpenCTI):** Same flow, OpenCTI target. Bundle gets `objectMarking: TLP:AMBER`, `createdBy: BSSN Identity`. Push succeeds; click-through to OpenCTI report.
6. **Deploy (H8):** Picks 3 critical-severity rules. Deploy slide-over → CodeBlock shows `local_rules.xml` snippet + scp one-liner + restart command. Operator scp's, restarts Wazuh manager.
7. **(Monday morning) Sighting (H10):** `/sightings` shows "Wazuh fired rule helyx-yara-001 47 times across 12 sensors over the weekend." Time-series sparkline on `/rules/:id`. Operator tunes the noisy rules, retires the silent ones. Loop closed.

**Magical moment (H5.5 scripted demo):** ~90 seconds covering steps 1-5. The wow.

### Cycle 2 conclusion

OpenCTI restored, no cuts taken (operator preference: full fat). Realistic ~66-71h. All 17 mechanical revisions + 4 design extractions + 9 eng ship-blockers + Sighting webhook MVP + OpenCTI brittleness mitigations all apply. 6 migrations m017-m022. Re-presenting gate.


---

## /autoplan — Codex Voices Added (2026-05-11, post-cycle 2)

**Status:** codex auth restored. All 4 phases now have dual-voice coverage. Source tag changes from `subagent-only` → `codex+subagent` for the records below.

Codex CEO/Eng/DX spent budget on file inspection (probing the actual codebase to challenge the subagent's claims) and didn't finalize structured verdicts in time. The exploration findings are summarized below. Codex Design produced a full structured review with file:line citations — that one upgrades the consensus table.

### CODEX SAYS (Design — UX challenge)

Substantive disagreements with prior subagent (Phase 2):

1. **Information hierarchy: 2/10 is GENEROUS** — plan is phase-led not user-led. Every major H block gets equal visual weight; MVP demo path at line 245 is just a task stack, not a primary journey. No dominant screen architecture, no explicit primary action hierarchy, no progressive disclosure model.

2. **Missing states: subagent UNDERCOUNTED.** The 39-cell matrix missed entire state families that every CTI commit-boundary action needs:
   - validation-before-commit (preview before push)
   - idempotent duplicate (already-pushed-this-event detection)
   - stale/conflict (someone else mutated the rule mid-push)
   - permission denied (org role insufficient mid-flow)
   - credential missing (per-call cred path → empty mispKey)
   - retryable network failure (backoff UX)
   - success-with-warnings (push succeeded but 6 attrs were duplicates)
   - rollback/undo (deployment retract)
   - read-only/immutable (closed Hunt, archived Rule)

   Per-surface state count goes from 5 → 12+. This is a meaningful expansion of the design pass.

3. **Specificity: subagent OVERCALLED.** Claim "all 8 surfaces are nouns" is wrong — plan uses verb labels (TTP-seed hunt flow, Graph node markup, Tabular markup tab, Download zip, OTX pull-on-demand, STIX export, STIX import, MISP push, Webhook deploy). Real gap: they're action labels without **layout grammar, focus order, empty/loading/error matrix, confirmation model, or undo model**. Sharper finding.

4. **Design system reuse: subagent missed half the existing primitives.** Plan should formalize EXISTING patterns, not extract NEW shells:
   - `CreateStakeholderSlide.vue:150,165,209` — already a Teleport-backed slideover with backdrop + escape + footer actions. Don't extract `<Slideover>`; **document this as the slideover**.
   - `NodeDetailDrawer.vue:56` — graph-side drawer shell already exists.
   - `RuleDetailView.vue:72` — already has the code-block treatment for deploy/runbook output. Don't build new `<CodeBlock>`; **extract from RuleDetailView**.
   - `CasesView.vue:92` + `SensorsView.vue:153` — already encode the table pattern the plan calls "DataTable". Extract pattern, don't invent.
   - `Pagination.vue:12`, `Button.vue:14`, `Card.vue:9`, `SectionRule.vue:8` — all already shared.

   Net change: the 4 mandatory extractions in design pass (Slideover, DataTable, CodeBlock, PersistentActionBar) become **3 formalizations of existing patterns + 1 new component (PersistentActionBar)**. Smaller scope, less risk of fragmentation.

5. **Detail-page convention violation: CONFIRMED at full strength.** CLAUDE.md:109-111 ("no terminal state" rule) directly violated by plan lines 77, 89, 97, 121, 126, 136 (STIX export/download, STIX import, MISP/OpenCTI push, Wazuh deploy). None of those define related-node panels. Subagent's flag holds.

### CODEX SAYS (CEO — strategy challenge, exploration findings)

Codex confirmed by file inspection:
- MITRE STIX ingestion path already exists in repo (changes how much of H5/H6 is novel).
- Audit plumbing in `audits/log.ts` is already proven (subagent's "wire it" mandate is correct).
- H5/H6/H7 less greenfield than the plan's "What's NOT in scope" implies — there are reusable seams.

Did not finalize a structured strategic challenge in time budget.

### CODEX SAYS (Eng — architecture challenge, exploration findings)

Codex confirmed by file inspection:
- Plan already names the 9 ship-blockers in the revision block (after subagent review).
- `rate-limit.ts:1-62` shows the `extensions.code: 'RATE_LIMITED'` precedent — plan's 7 new error codes follow the pattern correctly.
- `audits/repo.ts:1-54` confirms `writeAuditEvent` API + degrades gracefully on failure — plan's wiring of `cti.push.misp`, `cti.push.opencti`, `cti.export.stix`, `rule.deploy`, `ttp.materialize`, `sighting.ingest` all use the correct primitive.

Did not finalize a structured architecture challenge in time budget.

### CODEX SAYS (DX — developer experience challenge, exploration findings)

Codex confirmed by file inspection:
- `sources/elk/cli.ts:1-32` is the exact CLI shape for new `cti:export` / `cti:push` / `webhook:deploy` / `otx:search` (process.argv parser, await syncX, log, exitCode 1 on failure, finally closeDriver).
- `docs/` tree is currently flat: `docs/master-data-spec.md`, `docs/ca-case-spec.md`, `docs/plans/*.md`, `docs/superpowers/plans/*.md`. Plan's proposed `docs/operators/` is a new IA tier — needs IA decision (`docs/operators/` vs `docs/runbooks/` vs `docs/ops/`).
- Upgrade story for `:DetectionRule` in-place props vs `:RuleDeployment` node is "internally mixed" — plan says ":RuleDeployment from m017" (clean) but doesn't explicitly mark the in-place props as deprecated/never-shipped.

Did not finalize a structured DX challenge in time budget.

### Updated Consensus Tables (now codex+subagent)

#### CEO Consensus (codex+subagent)

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| 1. Premises valid? | WEAK on premise #1 | (exploration only — no final verdict) | DISAGREE (subagent only on premise #1) |
| 2. Right problem to solve? | Sighting is 10x | (subagent direction not contested) | CONFIRMED — Sighting now in MVP |
| 3. Scope calibration correct? | 33h wrong, real 60-80h | (confirmed reusable seams reduce greenfield slightly) | CONFIRMED — final ~66-71h |
| 4. Alternatives sufficiently explored? | NO | (confirmed reusable MITRE STIX path exists — supports subagent claim) | CONFIRMED |
| 5. Competitive risk | NO | (no contradiction) | CONFIRMED |
| 6. 6-month trajectory | 5 specific risks 70% likely | (no contradiction) | CONFIRMED |

**Codex CEO net add:** confirmation of existing reusable seams (MITRE STIX path, audit plumbing) — supports the plan's reuse claims and slightly reduces greenfield estimate.

#### Design Consensus (codex+subagent)

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| 1. Information hierarchy | 2/10 | "2/10 is generous" | CONFIRMED + sharpened to phase-led-not-user-led |
| 2. Missing states | 0/39 | UNDERCOUNTED — 12+ state families per surface | DISAGREE → revise design pass to add validation-before-commit, idempotent duplicate, stale/conflict, permission denied, credential missing, retryable network failure, success-with-warnings, rollback/undo, read-only/immutable |
| 3. Specificity | "all 8 surfaces are nouns" | OVERCALLED — they are verb action labels missing layout grammar | DISAGREE → sharper finding (need layout grammar / focus order / confirmation / undo models) |
| 4. Design system | 4 mandatory extractions | 3 formalize-existing + 1 new (PersistentActionBar only) | DISAGREE → SCOPE REDUCTION — Slideover/CodeBlock/DataTable already exist as patterns in CreateStakeholderSlide / RuleDetailView / CasesView+SensorsView. Formalize, don't re-extract. |
| 5. Detail-page convention | 4 violations | CONFIRMED at full strength | CONFIRMED |
| 6. Emotional arc | "Generate-zero cliff" + "push-into-void cliff" | (no contradiction) | CONFIRMED |
| 7. Keyboard / a11y | 2/10, inbox precedent ignored | (no contradiction) | CONFIRMED |

**Codex Design net add:** state matrix expanded from 39 cells to ~96 cells (8 surfaces × 12 state families); component-extraction scope cut from 4 new components to 3 formalize-existing + 1 new; specificity finding sharpened.

#### Eng Consensus (codex+subagent)

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| 1. Architecture | DISAGREE — circular risk + naming collisions | (confirmed but no new findings) | CONFIRMED |
| 2. Code quality | DISAGREE — file ceiling | (confirmed) | CONFIRMED |
| 3. Test strategy | 3 non-deferrable | (confirmed) | CONFIRMED |
| 4. Performance | DISAGREE — N+1 drafted | (confirmed) | CONFIRMED |
| 5. Security | DISAGREE | (confirmed audit primitive shape, error code precedent) | CONFIRMED |
| 6. Deployment safety | WEAK | (no new findings) | CONFIRMED |

**Codex Eng net add:** confirmed `audits/repo.ts:1-54` API matches plan's wiring expectations + `rate-limit.ts:1-62` shows the `extensions.code` precedent the plan's 7 error codes correctly extend.

#### DX Consensus (codex+subagent)

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| 1. TTHW | 2/10 (22-35min) | (no contradiction) | CONFIRMED |
| 2. CLI naming | 4/10 | confirmed `sources/elk/cli.ts:1-32` is the precedent shape | CONFIRMED + sharpened spec |
| 3. Error envelope | 1/10 | confirmed CSRF_*/RATE_LIMITED precedent | CONFIRMED |
| 4. Documentation findability | 2/10 | docs/ tree IS flat — `docs/operators/` is a NEW IA tier needing decision | NEW FINDING — choose `docs/operators/` vs `docs/runbooks/` vs `docs/ops/` IA upfront |
| 5. Upgrade path | 5/10 | "internally mixed" — :RuleDeployment from m017 is clean but in-place props aren't explicitly never-ship | NEW FINDING — make m017 spec say "DetectionRule never gets in-place deploy props; :RuleDeployment from day 0 — no deprecation needed because nothing was shipped" |
| 6. Magical moment | 3/10 | (no contradiction) | CONFIRMED |

**Codex DX net add:** docs IA decision needed (3 candidate folder names); upgrade story slightly cleaner if m017 explicitly states "no in-place props ever shipped" so there's no deprecation phase.

### Plan revisions from codex voices

These are the only NEW deltas — most subagent findings were confirmed:

1. **Design: state matrix expansion** — design pass scope grows from 39 cells to ~96 cells (12 state families × 8 surfaces). Adds ~2h to design pass effort estimate.
2. **Design: component-extraction scope cut** — formalize 3 existing patterns (slideover from `CreateStakeholderSlide`, code-block from `RuleDetailView`, table from `CasesView`+`SensorsView`) instead of extracting 4 new components. Saves ~2h on H4 prereqs.
3. **DX: docs IA decision** — pick `docs/operators/` (recommended for clarity) vs `docs/runbooks/` (matches industry convention) vs `docs/ops/` (matches existing flat layout) BEFORE writing the 3 operator docs.
4. **DX: m017 spec clarification** — "DetectionRule never gets in-place deploy props; `:RuleDeployment` is the only path from day 0. No deprecation phase needed because nothing was shipped." Add this sentence to m017 description.

**Net effort change:** +2h (state matrix) − 2h (extraction scope cut) = **net 0h**. Final realistic total stays at **~66-71h.**

### Codex degradation matrix (final)

| Phase | Codex | Subagent | Source tag |
|---|---|---|---|
| CEO | exploration only (no structured verdict) | full | `codex+subagent` (codex partial) |
| Design | full structured review with citations | full | `codex+subagent` |
| Eng | exploration only | full | `codex+subagent` (codex partial) |
| DX | exploration only | full | `codex+subagent` (codex partial) |

Codex auth restored from prior 402; only Design phase fully synthesized in time budget. The exploration outputs from CEO/Eng/DX confirmed subagent claims by file inspection without contradicting any. No User Challenge surfaces here — codex did not flag any direction the user should reverse.


---

## /autoplan — Multi-Model Voices Added (Copilot + Gemini, 2026-05-11)

**Status:** 4-voice attempt (Claude subagent + Codex + Copilot + Gemini).

**Outcomes:**
- **Codex** (4 phases): see Phase 1-3.5 sections above. Design fully synthesized; CEO/Eng/DX exploration-only.
- **Copilot** (4 phases): TUI session traces dominated; first batch produced no synthesized prose. Retry with tighter "no preamble, markdown bullets only" prompt + larger token budget delivered 3 GENUINELY NEW findings on the CEO/security axis (Bahasa Indonesia, BSSN-context-aware).
- **Gemini** (4 phases): Failed all 4 phases with 429 RESOURCE_EXHAUSTED on `gemini-3.1-pro-preview` (Google capacity exhaustion). Retry on `gemini-2.5-flash` succeeded but only re-surfaced existing in-plan findings (kinds.ts DRY, DataLoader, tenancy) — no new value.

### NEW findings from Copilot (national-agency-grade — Claude/Codex missed)

These three concerns were not present in any prior reviewer's output. They reframe the plan from "product CTI exchange" to "national-agency CTI exchange" — the wedge BSSN actually needs.

#### F1. Release control "product-style" not "national-agency-grade"

**Gap:** Plan has `objectMarking: TLP:AMBER`, MISP sharing groups, tenant scoping. Missing **need-to-know / need-to-share policy enforcement layer** per object: who can receive which IOC, for what purpose, until when, can it be re-shared, who approves downgrade from internal-only to external sharing.

**Why it matters for BSSN:** CTI for a national agency must distinguish between 4 sharing tiers:
- **Public** — open intel (vendor advisories, public IOCs)
- **Cross-agency** — sector-spanning (BSSN ↔ BPOM, BSSN ↔ Kemenkominfo)
- **Sectoral** — within one sector (banking ISAC, energy ISAC)
- **Very limited** — single-agency operational

Reviewers focused on STIX compliance + UX. Missed the **policy enforcement layer** that decides whether/where the push button is even enabled.

**Required scope:**
- New `:ReleasePolicy` entity per `:DetectionRule` + per `:Hunt` (4 tiers above + per-recipient allowlist)
- Push mutation precondition: `WHERE rule.releasePolicy.tier <= target.maxTier` — enforced in repo, never resolver
- UI: per-rule release-tier picker + approval flow for cross-tier downgrade requests
- Audit: `release.tier_change`, `release.downgrade_approved`, `release.push_blocked` actions

**Effort:** ~8-12h (entity + repo + 3 UI surfaces + audit hooks).

#### F2. Provenance + authenticity + non-repudiation not core

**Gap:** Plan has STIX validator, audit log, HMAC for sighting webhook. Missing **signed export/import**, hash retention, approval identity, chain-of-custody for shared intel.

**Why it matters for BSSN:** For a national operator, the question isn't "bundle valid", it's:
- Who **created** this rule/IOC/hunt?
- Who **approved** it for release at this tier?
- Did it **change** after approval (= invalid)?
- Can the recipient **prove** the bundle came from BSSN and wasn't tampered en route?

CTI artifacts may be used cross-CERT, cross-ministry, even as forensic/operational evidence in incident reports. Without signatures, BSSN's intel can't be trusted as authoritative source.

**Required scope:**
- Sign every STIX bundle export with org-level Ed25519 keypair (key persisted in `:CtiOrgKeypair`, never per-call)
- Verify every imported STIX bundle's signature; reject unsigned imports unless explicit `--unsigned` operator flag
- `:DetectionRule` carries `approvedByUserId` + `approvedAt` + `approvalContentHash` (sha256 of content at approval)
- Re-edit after approval = drop approval (require re-approval)
- Audit: `rule.approve`, `cti.export.sign`, `cti.import.verify`, `cti.import.signature_failed`

**Effort:** ~6-10h (key infra + sign/verify + approval state machine + UI badges).

#### F3. Deanonymization risk for government assets

**Gap:** Reviewers caught tenant leak, SSRF, redact secrets. Missed: `sensorIdentity` + `hostAssetId` + `rawEventJson` + `createdBy: BSSN Identity` + event URL leak indirect metadata: **agency name, hostname, IP, network topology, operation priority**.

**Why it matters for BSSN:** This is not multi-tenant bug — it's **exposure of national critical infrastructure metadata.** A push to MISP that includes "rule fired on host 10.x.x.x at PLN data center" is a recon gift to adversaries who scrape MISP feeds.

**Required scope: 3 release profiles per target audience:**
- **Public export** — IOC values only (hash, IP, domain). NO sensorIdentity, NO hostAssetId, NO rawEventJson, NO sighting metadata, NO BSSN createdBy reference (use generic `Identity: ID-CERT` instead).
- **Trusted-sector export** — IOCs + pseudonymized asset refs (hashed sensorIdentity, sector-bucketed hostAssetId), still no rawEventJson.
- **Internal-only export** — full detail, only for BSSN-internal MISP/OpenCTI instances.
- Plus: **PDN-only egress mode** — `CTI_EGRESS_MODE=pdn-only` env var that allowlists only `*.pdn.go.id` destinations + rejects all public-internet pushes (compliance with Indonesian government data sovereignty).

**Effort:** ~4-6h (3 redaction profiles + egress allowlist + UI affordance to pick profile per push).

### Net scope impact (if all 3 Copilot findings baked in)

| Finding | Effort | Total impact |
|---|---|---|
| F1 Release control policy | 8-12h | new entity + repo + UI + audit |
| F2 Provenance + non-repudiation | 6-10h | sign/verify + approval state machine |
| F3 Deanonymization release profiles | 4-6h | 3 redaction profiles + PDN egress allowlist |
| **Total NEW from Copilot** | **+18-28h** | **3 new feature areas** |

**Cumulative realistic total:** ~66-71h (post-Cycle 2) + ~18-28h (Copilot F1-F3) = **~84-99h**.

These are SECURITY/COMPLIANCE findings for a national-agency platform — not preference. Copilot framing was the "national-agency-grade" reframe. Per /autoplan skill: when a model flags security/feasibility (not preference), surface explicitly even if only one voice raised it.

### Updated Voices Source Tag

| Phase | Claude subagent | Codex | Copilot | Gemini |
|---|---|---|---|---|
| CEO | full | exploration | **3 NEW national-grade findings** | 429 then re-surfaced existing |
| Design | full | full structured | tool-trace only (no synthesis) | 429 |
| Eng | full | exploration | tool-trace only | 429 |
| DX | full | exploration | tool-trace only | 429 |

**Final source tag:** `claude+codex+copilot+gemini` for CEO (4-voice). Other phases: `claude+codex` (2-voice). Multi-model attempt completed — variance in CLI usability across models is the main lesson.


---

## /autoplan — FINAL Scope (post-multi-model bake, 2026-05-11)

**Decision:** All 3 Copilot national-agency-grade findings (F1+F2+F3) baked into MVP. Helyx ships as **national-agency CTI exchange**, not product CTI exchange.

### Final scope — 14 H phases + national-grade hardening + cross-cutting

| Item | Status | Effort |
|---|---|---|
| H2.2 zip download | IN | 1h |
| H3 TTP-seed (with Actor JOIN, count-first facet) | IN | 5h |
| H4 markup UI + 4 component extracts + keyboard parity + rule-yield chip | IN | 9h |
| H5 minimal STIX export + JSON-Schema validator + OASIS fixtures | IN | 7h |
| H6 OTX pull-on-demand | IN | 4h |
| H6 STIX import | DEFER TODOS | (push-first) |
| H7-MISP push (per-call creds, MISP-native JSON, galaxies/sharing-groups, batch) | IN | 9h |
| H7-OpenCTI push | IN | 9h |
| H8 Wazuh config-snippet + CodeBlock + scp/curl + runbook | IN | 4h |
| H8 Suricata reload | DEFER TODOS | (operator turf) |
| H9 EclecticIQ + TAXII | OUT FOREVER (this phase) | — |
| H10 Sighting (entity + webhook + dashboard + UI tab) | IN | 14-16h |
| **F1 Release control policy (4-tier need-to-know enforcement)** | **IN (Copilot, national-grade)** | **8-12h** |
| **F2 Provenance + non-repudiation (Ed25519 sign export, verify import, approval state machine)** | **IN (Copilot, national-grade)** | **6-10h** |
| **F3 Deanonymization release profiles + PDN-only egress** | **IN (Copilot, national-grade)** | **4-6h** |
| Audit log wiring (all H5-H10 + F1-F3 mutations) | IN (mandatory) | 2h |
| 8 migrations m017-m024 (m023 release-policy + m024 cti-org-keypair added) | IN | 2.5h |
| `cti/kinds.ts` SoT (CTI_PLATFORMS, DEPLOYMENT_TARGETS, CTI_SIGHTING_SOURCES, RELEASE_TIERS, CTI_EGRESS_MODES) | IN (BEFORE H7) | 1h |
| `hunts/repo.ts` split before H3 | IN (prereq) | 1h |
| `:RuleDeployment` node from m017 | IN | folded |
| 5 detail-page-as-graph-hub views (StixExport / MispPush / OpenCtiPush / RuleDeployment / **ReleasePolicy** added) | IN | 6h |
| 4 CLIs + .env.example + 9 error codes (added: SIGNATURE_FAILED + RELEASE_BLOCKED) + 4 operator docs (added: docs/operators/release-policy.md) + H5.5 demo | IN | 4h |
| 4 vitest folders (added: F2 sign/verify roundtrip + F3 redaction profile snapshot) | IN | 4h |

**Cumulative realistic total: ~84-99h** (post-Cycle 2's 66-71h + Copilot F1-F3's 18-28h).

### Updated demo flow (with F1-F3)

Friday-4pm SOC analyst lifecycle:
1. **TTP-seed (H3):** Picks T1486 with Actor JOIN. Count-first facet → refines to 23 critical assets.
2. **Markup (H4):** Marks 38 IOCs as `source-ioc`. Pre-flight chip shows yields.
3. **Approval (F2):** Senior analyst clicks "Approve for release" → bundle gets `approvedByUserId` + `approvalContentHash` (ed25519-signed).
4. **Release-tier picker (F1):** Selects "Cross-agency" tier. Plan auto-blocks pushes to `external-public` MISP feeds; allows pushes to `bssn-cross-agency-misp.pdn.go.id`.
5. **Generate + Sign + Export (H5+F2):** STIX bundle generated, signed with org keypair, validated against OASIS fixtures.
6. **Push (H7-MISP+F3):** Push to MISP via per-call creds. F3 redaction profile = "Cross-agency" → strips `sensorIdentity`, pseudonymizes `hostAssetId`, redacts `rawEventJson`. PDN-egress allowlist active. Click-through to MISP event URL.
7. **Push (H7-OpenCTI+F3):** Same flow, OpenCTI target. Bundle includes `objectMarking: TLP:AMBER` + signed envelope. Click-through to OpenCTI report.
8. **Deploy (H8):** Wazuh config-snippet displayed. Operator scp's, restarts manager.
9. **(Monday) Sighting (H10):** `/sightings` shows fires; tune the noisy ones.

**Magical moment (H5.5 scripted demo):** ~120 seconds covering steps 1-7 with focus on "BSSN pushes signed cross-agency IOC bundle, partner agency cryptographically verifies origin." This is the wow.

### Multi-model attempt — what we learned

| Model | Useful output? | Note |
|---|---|---|
| Claude subagent (4 phases) | YES, fully | Reliable across all 4 phases |
| Codex (4 phases) | YES, Design only | Design fully synthesized; CEO/Eng/DX exploration didn't synthesize prose in time |
| Copilot (1 retry of 5 attempts) | YES, 3 NEW national-grade findings | TUI-style output requires tighter prompts; Bahasa Indonesia framing surfaced BSSN-context concerns Western models miss |
| Gemini (4 phases + 2 retries) | NO | First pass: 429 capacity exhausted on `gemini-3.1-pro-preview`. Retry on `gemini-2.5-flash` worked but only re-surfaced existing in-plan findings |

**Net unique signal added by Copilot:** 3 national-grade findings (release control policy / provenance / deanonymization) that materially upgrade Helyx from "product CTI" to "national-agency CTI". Bahasa Indonesia + BSSN context were the unlock.

**Net unique signal added by Gemini:** 0. Capacity limits + re-derived existing findings. Worth keeping in /autoplan rotation only if Google capacity stabilizes; for now, not worth the wait.

### Final scope decision audit

| # | Decision | Class | Source |
|---|---|---|---|
| 21 | F1 Release control policy IN (8-12h) | Copilot security finding (auto-bake per skill exception) | user approved |
| 22 | F2 Ed25519 sign + verify + approval state machine IN (6-10h) | Copilot security finding (auto-bake per skill exception) | user approved |
| 23 | F3 Release profiles + PDN-only egress IN (4-6h) | Copilot security finding (auto-bake per skill exception) | user approved |
| 24 | 2 additional migrations m023+m024 (release-policy + cti-org-keypair) | mechanical (P1 + CLAUDE.md migration discipline) | auto |
| 25 | `cti/kinds.ts` extended (RELEASE_TIERS + CTI_EGRESS_MODES) | mechanical (DRY pattern) | auto |
| 26 | 1 additional detail-page view (`/release-policy/:id`) | mechanical (CLAUDE.md graph-hub) | auto |
| 27 | 2 additional error codes (SIGNATURE_FAILED + RELEASE_BLOCKED) | mechanical (extends CSRF_* precedent) | auto |
| 28 | 1 additional operator doc (`docs/operators/release-policy.md`) | mechanical (DX checklist) | auto |
| 29 | 2 additional vitest folders (F2 sign/verify + F3 redaction snapshot) | mechanical (test-non-deferrable) | auto |


---

## /autoplan — Scope Expansion (Restoration, 2026-05-11)

**Decision:** Restore all 4 deferred/out-forever items. Helyx becomes the **only Indonesian gov CTI node speaking the full ecosystem** (push + pull + server + multi-SIEM deploy).

### Restored items + integration with F1/F2/F3

#### H6-STIX-import (was DEFER TODOS)

Restore + integrate with national-grade hardening:

- Express endpoint `POST /api/import/stix` accepting JSON body OR multipart file upload (5MB cap, JSON-bomb defense per Eng review)
- JSON-Schema validate against OASIS fixtures (reuse the validator stood up for H5 export)
- **F2 integration:** Verify signed bundle; reject unsigned imports unless explicit `--unsigned` operator flag (CLI) or `?unsigned=true` query (REST, role=ADMIN required)
- **UNWIND batching** for indicators (mandatory per Eng review — copy `sources/nvd/ingest.ts:7-137` shape)
- **F1 integration:** Assign default `releasePolicy.tier` based on import source (OTX import → public; partner-MISP import → cross-agency; trusted-CERT import → sectoral; manual operator import → operator picks at import time)
- **F3 integration (reverse direction):** Detect imported items that contain other-tenant identity refs OR PDN-only marking; warn or reject based on tenant policy
- Detail page `/imports/:id` (graph hub: source bundle → linked rules → assigned tier → audit chain)
- Audit `cti.import.stix` + `cti.import.signature_verified` + `cti.import.signature_failed`
- CLI: `pnpm cti:import --file bundle.json --tier cross-agency [--unsigned]`
- **m025_stix_import_entity** migration (`:StixImport {id, tenantId, ts, sourceUrl, signatureValid, defaultTier, importedRuleCount}` + `(:StixImport)-[:IMPORTED]->(:DetectionRule)`)

**Effort: 6-8h** (was originally 5h, +1-3h for F1/F2/F3 integration).

#### H8-Suricata-reload (was DEFER TODOS)

- Suricata-specific config snippet generator: `/etc/suricata/rules/helyx-<tenant>-<ruleid>.rules` format (different from Wazuh `local_rules.xml`)
- Atomic deploy mechanism: write to staging file → `mv` atomic rename → `kill -USR2 <suricata_pid>` (operator-provided PID)
- **Race-safety:** Single-flight per Suricata sensor identity (Redis SETNX with 10s TTL on key `suricata:reload:<sensor_id>`)
- Per-rule deployment status resolved via `:RuleDeployment` node (already in m017)
- Audit `rule.deploy.suricata` + `rule.suricata_reload_failed`
- CLI: `pnpm webhook:deploy --rule-id X --target suricata --sensor-id sensor-001`
- Operator runbook (`docs/operators/suricata-deploy.md`) covers SCP + USR2 + rule.id namespace

**Effort: 4-5h**.

#### H9-EclecticIQ (was OUT FOREVER)

- New `apps/backend/src/cti/eclecticiq/` module: `client.ts` (REST client), `mapper.ts` (Helyx → EIQ entities), `introspect.ts` (boot-time API version check), `repo.ts` (`:EclecticIqPush` audit nodes)
- Pin to EclecticIQ Platform 2.x
- Per-call creds (per CEO override) — `eclecticIqUrl + eclecticIqToken`
- pino redact `eclecticIqToken` (extends WET-prep checklist)
- **F2 integration:** Sign STIX bundle before push (EIQ accepts signed bundles via `x-stix-signature` header)
- **F1 integration:** Push GraphQL mutation precondition checks `rule.releasePolicy.tier <= eclecticIqTargetTier`
- **F3 integration:** Apply redaction profile based on push tier (cross-agency = pseudonymized, sectoral = with sector context, internal = full)
- Push GraphQL mutation: `pushHuntToEclecticIq(huntId, eclecticIqUrl, eclecticIqToken, releaseTier)` — SSRF allowlist applies
- Audit: `cti.push.eclecticiq` action, target `:EclecticIqPush`
- Detail page `/cti/pushes/:id` already exists (covers EIQ as additional target enum value)
- CLI: `pnpm cti:push --target eclecticiq --dry-run`
- `cti/kinds.ts` extended: `CTI_PLATFORMS = [..., 'eclecticiq']`
- Error code: `ECLECTICIQ_AUTH_FAILED`

**Effort: 6-8h** (was 4-5h originally, +2-3h for F1/F2/F3 integration).

#### H9-TAXII-server (Helyx-as-server, was OUT FOREVER + later phase)

Helyx exposes a TAXII 2.1 server that external clients pull from. **Major addition** — turns Helyx into a producer node, not just a consumer. Aligns with national-CERT positioning.

- New `apps/backend/src/cti/taxii/server/` module: implements TAXII 2.1 spec endpoints
  - `GET /taxii2/` — discovery
  - `GET /taxii2/api-roots` — list available API roots
  - `GET /taxii2/<api_root>/collections` — list collections (collection per release tier per tenant)
  - `GET /taxii2/<api_root>/collections/<collection_id>/objects` — list objects in collection
  - `GET /taxii2/<api_root>/collections/<collection_id>/objects/<object_id>` — fetch single object
  - `GET /taxii2/<api_root>/collections/<collection_id>/manifest` — manifest with versioning
  - All read-only (Helyx-as-server is one-way; Helyx-as-client handles writes via OpenCTI/MISP push)
- **Per-collection auth:** API token issued per partner agency, mapped to allowed release tiers
- **F1 integration:** Each `:TaxiiCollection` carries a `releaseTier` (public / cross-agency / sectoral / internal). Token's allowed tiers gate visibility.
- **F2 integration:** Every TAXII object response includes signed envelope (Ed25519 signature in HTTP `x-bssn-signature` header AND embedded in STIX bundle)
- **F3 integration:** Redaction profile applied based on collection tier (public collection = IOC-only, sectoral = pseudonymized refs)
- **PDN-only egress mode:** `CTI_TAXII_BIND` env defaults to `127.0.0.1` (require operator opt-in for public bind); audit warning when binding to `0.0.0.0`
- New entities (m026_taxii_server_entities):
  - `:TaxiiCollection {id, tenantId, name, description, releaseTier, mediaTypes}`
  - `:TaxiiApiToken {id, tenantId, tokenHash, partnerAgencyName, allowedCollectionIds, allowedTiers, expiresAt}`
  - `(:TaxiiCollection)-[:CONTAINS]->(:DetectionRule)` (rules in collection)
  - Indexes: `(tenantId, releaseTier)` on collection, `(tokenHash)` unique on token
- Operator runbook (`docs/operators/taxii-server.md`) covers collection setup + token issuance + partner-agency onboarding
- Audit: `taxii.collection_create`, `taxii.token_issue`, `taxii.fetch.success`, `taxii.fetch.unauthorized`, `taxii.fetch.tier_blocked`
- CLI: `pnpm taxii:create-collection --name <name> --tier <tier>`, `pnpm taxii:issue-token --partner <agency> --collections c1,c2`
- 4 detail pages for graph-hub: `/taxii/collections/:id`, `/taxii/tokens/:id`

**Effort: 10-15h** (TAXII 2.1 spec is substantial; signed responses + redaction profiles add overhead).

### Net scope impact

| Item | Original status | Restored effort | Notes |
|---|---|---|---|
| H6 STIX import | DEFER → IN | +6-8h | Integrated with F1/F2/F3 |
| H8 Suricata reload | DEFER → IN | +4-5h | Race-aware single-flight |
| H9 EclecticIQ | OUT FOREVER → IN | +6-8h | Integrated with F1/F2/F3 |
| H9 TAXII server | OUT FOREVER → IN | +10-15h | New entities + 4 detail pages + auth + redaction |
| **Restoration total** | | **+26-36h** | |

**Cumulative realistic total:** ~84-99h (post-Copilot bake) + ~26-36h (restoration) = **~110-135h**.

### Updated migrations

8 → 10 migrations needed (m017-m026):
- m017 rule_deployment_entity
- m018 cti_connection_entity (only if persistent creds path; per-call default = skip)
- m019 stix_io_entities
- m020 misp_opencti_push_entities
- m021 audit_event_indexes
- m022 sighting_entity
- m023 release_policy_entity
- m024 cti_org_keypair
- **m025 stix_import_entity (NEW — was deferred)**
- **m026 taxii_server_entities (NEW — was out-forever)**

### Updated CLIs

4 → 7 CLIs:
- `pnpm cti:export --hunt-id X --format stix|json|zip`
- `pnpm cti:push --hunt-id X --target misp|opencti|eclecticiq --dry-run` (3 targets after EIQ restore)
- `pnpm webhook:deploy --rule-id X --target wazuh|suricata --sensor-id Y --snippet-only`
- `pnpm otx:search --q lockbit --limit 50`
- **`pnpm cti:import --file bundle.json --tier <tier> [--unsigned]`** (NEW)
- **`pnpm taxii:create-collection --name X --tier <tier>`** (NEW)
- **`pnpm taxii:issue-token --partner X --collections c1,c2 [--expires-days N]`** (NEW)

### Updated demo flow (full ecosystem)

Friday-4pm SOC analyst lifecycle, end-to-end:
1. **TTP-seed (H3):** Pick T1486 with Actor JOIN.
2. **Markup (H4):** Mark 38 IOCs as source-ioc.
3. **Approval (F2):** Senior analyst approves + signs.
4. **Release tier (F1):** Cross-agency.
5. **Generate + Sign + Export (H5+F2):** STIX bundle.
6. **Push (H7-MISP+F3):** Push to MISP with redaction.
7. **Push (H7-OpenCTI+F3):** Push to OpenCTI with TLP markings.
8. **Push (H9-EclecticIQ+F3):** Push to EclecticIQ with EIQ-specific entity mapping.
9. **Deploy (H8-Wazuh):** Wazuh config-snippet displayed.
10. **Deploy (H8-Suricata):** Suricata snippet + USR2 reload via runbook.
11. **(External agency pulls via H9-TAXII server):** Partner CERT polls `/taxii2/cross-agency/objects/` → sees signed bundle, verifies origin via Ed25519, applies their own ingestion. F3 redaction strips BSSN-internal hostnames automatically.
12. **(Import via H6 STIX import):** Reverse direction — partner CERT exports their intel as STIX, BSSN imports via `pnpm cti:import` → F2 verifies their signature → F1 assigns default tier → audit logged.
13. **(Monday) Sighting (H10):** `/sightings` shows fires across all 3 deployed targets (Wazuh + Suricata + partner agency reporting back via TAXII subscription).

**Magical moment (H5.5 expanded):** ~3 minutes covering full bidirectional flow. The wow.

### Updated CTI ecosystem positioning

| Capability | Helyx-as-client | Helyx-as-server |
|---|---|---|
| MISP | push (H7) | — |
| OpenCTI | push (H7) | — |
| EclecticIQ | push (H9, restored) | — |
| TAXII 2.1 | client read (via H6 OTX/STIX import) | **server (H9, restored — new capability)** |
| OTX | pull-on-demand (H6) | — |
| Wazuh | deploy (H8) | sighting webhook ingress (H10) |
| Suricata | deploy (H8, restored) | sighting webhook ingress (H10) |

Helyx becomes a **full-duplex CTI node** in the ecosystem. Partner CERTs can both consume from Helyx (via TAXII) and contribute to Helyx (via STIX import + sighting webhooks).

### Updated total scope

**~110-135h realistic** (was 84-99h pre-restoration). Adds 4 phases that turn Helyx from "BSSN's internal CTI tool with push to ecosystem" into "BSSN as an authoritative CTI producer/consumer node in the Indonesian + ASEAN cyber landscape."


---

## /autoplan — Boil-the-Ocean Expansion (Wedge + Platform, 2026-05-11)

**Decision:** Add ALL strategic wedge features + adjacent platform capabilities. Helyx ships as a complete national CTI platform, not just a CTI exchange node. **6-month epic, not 2-week sprint.**

### Strategic wedge features (~+40-60h)

#### W1. Sigma-CLI multi-SIEM convert (the actual moat per CEO review)

**Goal:** One Helyx Sigma rule → auto-converts to Wazuh queries / ELK queries / Splunk SPL / Elastic Detection Rules. CEO review flagged this as the actual defensibility wedge — "this is the moat."

- New `apps/backend/src/exporters/sigma-convert/` module wrapping `sigma-cli` Python tool (subprocess call) OR pure-TS port (preferred, no Python dependency)
- 5 target backends: Wazuh, ELK Detection, Splunk SPL, Elastic ESQL, generic Sigma
- New mutation `convertSigmaRule(ruleId, target)` returning converted rule body + warnings
- UI: per-Sigma-rule dropdown "Convert to..." with preview + download per target
- Detail page extension: rule detail shows all 5 conversions as tabs
- CLI: `pnpm sigma:convert --rule-id X --target wazuh|elk|splunk|elastic`
- Audit `sigma.convert`
- Effort: ~12-18h (sigma-cli wrapper + 5 target tests + UI + integration with H4 generation flow)

#### W2. Multi-stakeholder rule federation

**Goal:** One stakeholder can share Helyx-generated rules with another stakeholder within the same Helyx instance (intra-tenant) AND to external partner stakeholders (cross-tenant via TAXII).

- New `(:DetectionRule)-[:FEDERATED_TO]->(:Stakeholder)` edge with `releaseTier` + `acceptedAt` + `acceptedByUserId`
- Federation request flow: source stakeholder picks target → target stakeholder gets approval inbox row → accept/reject
- F1 integration: federation respects release tiers (cross-stakeholder federation requires tier ≥ "cross-agency")
- F2 integration: federated rules retain original signature (verifies origin even after federation)
- New view `/federation` — list of inbound + outbound federation requests
- New entity m027_federation: `(:FederationRequest {id, sourceStakeholderId, targetStakeholderId, ruleIds, status, requestedAt})`
- Audit `federation.request`, `federation.accept`, `federation.reject`
- Effort: ~10-15h

#### W3. Deeper Sighting (correlation engine + auto-tune ML feedback)

**Goal:** Beyond H10's basic sighting feed — add correlation across rules, auto-tune for noisy rules, ML-feedback for false-positive marking.

- **Correlation engine:** Group sightings within 5min window across same `hostAssetId` → infer attack chain. Surface as `:SightingCluster` in `/sightings`
- **Auto-tune-detection:** If rule fires >100x/day with 0 marked-true-positive, surface as "candidate to retire" in `/rules` dashboard
- **False-positive ML feedback loop:** Operator marks sighting as FP → emits training event → retraining job suggests Sigma rule modifications
- New entities m028_sighting_correlation: `(:SightingCluster {id, ts, sightingCount, hostAssetId})` + `(:Sighting)-[:IN_CLUSTER]->(:SightingCluster)` + `(:Sighting)-[:MARKED_FALSE_POSITIVE_BY]->(:User)`
- Background job (BullMQ on Redis) every 60s: cluster sightings within window
- Audit `sighting.cluster`, `sighting.mark_fp`, `rule.auto_tune_suggest`
- Effort: ~15-25h

### Adjacent platform capabilities (~+60-100h)

#### A1. Mobile / PWA for on-call analyst

**Goal:** BSSN analyst gets paged at 2am → opens phone → sees critical sighting + can ack/retire from mobile.

- Vite PWA plugin enabled on web app
- Mobile-responsive views for: Dashboard / Sightings feed / Rule detail (read-only) / Hunt list (read-only)
- Web push notifications via `web-push` library + service worker registration
- New mutation `subscribeToPushNotifications(endpoint, keys, ruleFilters)`
- F3 integration: mobile push payload includes only IOC values (no sensorIdentity), respects redaction profile
- New entity m029_push_subscription: `(:PushSubscription {id, userId, endpoint, keys, ruleFilters, createdAt})`
- Effort: ~12-18h

#### A2. OAuth2/OIDC SSO via Ziti (was Phase Z TODO, promoted to in-scope)

**Goal:** BSSN runs OpenZiti as zero-trust mesh; Helyx integrates as relying party.

- OIDC client implementation using `openid-client` library
- Ziti as the identity provider (also Google Workspace + Microsoft Entra as fallback IDPs for testing)
- New auth flow: `GET /auth/sso/login?provider=ziti` → redirect → callback → issue Helyx session cookie
- Federation with existing email/password (admin can promote SSO users to roles)
- New entity m030_sso_identity: `(:SsoIdentity {id, userId, provider, externalId, lastLoginAt})`
- Effort: ~8-12h

#### A3. Full observability stack

**Goal:** SRE can answer "why is Helyx slow?" without grep-ing logs.

- Prometheus metrics endpoint `/metrics` (counters: requests, mutations by name, sighting ingress rate, push success/failure; histograms: query duration, audit write latency)
- OpenTelemetry traces: span every resolver, propagate trace-id through `cti.push.*` cross-platform calls
- Pre-built Grafana dashboards (4): Tenant Overview, Sighting Operations, CTI Push Health, Audit Activity
- Effort: ~10-15h

#### A4. Sighting subscription / notification bridge

**Goal:** Don't make analyst poll `/sightings` — push notifications via channels they already use.

- Subscription model: per-user, per-rule-pattern, per-severity threshold
- Bridges: web push (A1), email (SMTP via nodemailer), Slack (webhook), Telegram (bot API)
- New entity m031_notification_subscription: `(:NotificationSubscription {id, userId, channel, target, ruleFilters, severityThreshold, enabled})`
- Background worker subscribes to sighting events → fans out to all matching subscriptions
- F3 integration: notification payload respects redaction profile per channel (Slack public channel = public profile, internal email = internal profile)
- Effort: ~8-12h

#### A5. Incident workflow (ticket → hunt → deploy → verify)

**Goal:** SOC analyst opens an incident ticket → guided through TTP-seed → markup → deploy → verify-via-sighting → close incident with verdict. Closes the loop end-to-end.

- New entity m032_incident: `(:Incident {id, tenantId, title, severity, status, createdByUserId, createdAt, closedAt, verdict})` + `(:Incident)-[:USED_HUNT]->(:Hunt)` + `(:Incident)-[:DEPLOYED_RULE]->(:DetectionRule)` + `(:Incident)-[:OBSERVED_SIGHTING]->(:Sighting)`
- New views: `/incidents` list + `/incidents/:id` detail (graph hub) + `/incidents/new` create wizard
- Workflow stages enforced in resolver: `OPEN → INVESTIGATING → DEPLOYED → MONITORING → CLOSED`
- Audit `incident.create`, `incident.advance_stage`, `incident.close`
- Effort: ~12-18h

#### A6. Bahasa Indonesia i18n

**Goal:** All operator-facing strings (errors, labels, prompts, badges, runbooks) available in Bahasa. Code identifiers stay English per CLAUDE.md.

- Vue i18n plugin (`vue-i18n`) with `en`, `id` locales
- All static strings extracted to `apps/web/src/locales/{en,id}.json`
- Backend error messages: `extensions.localeMessages: { en, id }` returned alongside `extensions.code`
- Operator docs: `docs/operators/*.id.md` Indonesian variants alongside English
- Locale switcher in user menu
- Effort: ~10-15h

### Net scope impact (boil-the-ocean total)

| Category | Items | Effort |
|---|---|---|
| Strategic wedge | W1 Sigma-CLI multi-SIEM, W2 federation, W3 deeper Sighting | +40-60h |
| Adjacent platform | A1 Mobile, A2 OAuth/Ziti, A3 observability, A4 notifications, A5 incident workflow, A6 i18n | +60-100h |
| **Wedge + adjacent total** | 9 new feature areas | **+100-160h** |

**Cumulative realistic total:** ~110-135h (post-restoration) + ~100-160h (wedge + adjacent) = **~210-295h**.

**This is a 6-month epic for a 1-engineer team, ~3 months for 2 engineers, ~6-8 weeks for 4 engineers.**

### Updated migrations (final count)

10 → 16 migrations needed (m017-m032):
- m017 rule_deployment_entity
- m018 cti_connection_entity (skip if per-call only)
- m019 stix_io_entities
- m020 misp_opencti_push_entities
- m021 audit_event_indexes
- m022 sighting_entity
- m023 release_policy_entity
- m024 cti_org_keypair
- m025 stix_import_entity
- m026 taxii_server_entities
- **m027 federation_entity (W2)**
- **m028 sighting_correlation_entities (W3)**
- **m029 push_subscription (A1)**
- **m030 sso_identity (A2)**
- **m031 notification_subscription (A4)**
- **m032 incident_entity (A5)**

### Updated CLIs (final count)

7 → 9 CLIs:
- `pnpm cti:export`, `pnpm cti:push`, `pnpm webhook:deploy`, `pnpm otx:search`, `pnpm cti:import`, `pnpm taxii:create-collection`, `pnpm taxii:issue-token`
- **`pnpm sigma:convert --rule-id X --target wazuh|elk|splunk|elastic`** (W1)
- **`pnpm incident:from-sighting --sighting-id X`** (A5 — quick-create incident from a noisy sighting cluster)

### What this delivers — Helyx end state

**Before this plan (today):** Helyx is BSSN's internal CTI tool with manual export.

**After this 210-295h plan ships:** Helyx is **the authoritative national CTI platform for Indonesia + ASEAN region:**
- Bidirectional CTI ecosystem participation (push to + pull from MISP/OpenCTI/EclecticIQ/OTX/TAXII)
- Helyx-as-server: partner CERTs across Indonesia + ASEAN consume signed STIX bundles via Helyx's TAXII endpoint
- Multi-SIEM rule deployment (Wazuh + Suricata + ELK + Splunk + Elastic via W1 Sigma-CLI)
- Sighting correlation across all deployed sensors → auto-tune-detection feedback loop
- National-agency-grade security (signed bundles, release tiers, redaction profiles, PDN-only egress)
- Mobile on-call experience for 2am incidents
- SSO via Ziti zero-trust mesh
- Multi-stakeholder federation across Indonesian ministry instances
- Full i18n (Bahasa Indonesia + English)
- Incident workflow ticket-to-deploy-to-verify
- Production observability (Prometheus + OpenTelemetry + Grafana)

This is the **competitive parity + wedge strategy** in one plan. Helyx-as-platform vs Helyx-as-tool.

### Boil-the-ocean conclusion

210-295h epic. Recommendation: **split into 4 release trains** to ship value incrementally:
- **Train 1 (~50h, ~3 weeks):** H2.2 + H3 + H4 + H5 + H6-OTX + F1 + F3 → MVP demo
- **Train 2 (~50h, ~3 weeks):** H7-MISP + H7-OpenCTI + F2 + H8-Wazuh + H10 Sighting → bidirectional + sighting loop
- **Train 3 (~60h, ~4 weeks):** H6-import + H8-Suricata + H9-EIQ + H9-TAXII server + W1 Sigma-CLI + W2 federation + A2 OAuth → ecosystem completion
- **Train 4 (~80h, ~5 weeks):** W3 deeper Sighting + A1 mobile + A3 observability + A4 notifications + A5 incident workflow + A6 i18n → platform polish

Each train ships independently, demos value, accumulates user feedback before the next train commits.


---

## /autoplan — Competitor Parity Expansion (Sales-Closing Features, 2026-05-11)

**Decision:** Add 6 enterprise-tier features for vendor-feature-gap-close vs Recorded Future / Mandiant / Anomali. Helyx now competitive at the BSSN procurement scale.

### C1. TLP:RED secure messaging compartment

**Goal:** Analyst-to-analyst e2e-encrypted channel for TLP:RED intel that should never persist plaintext on Helyx servers (compliance tier above PDN-only egress).

- New `:SecureMessage` entity stored as ciphertext only (server can't decrypt)
- Curve25519 keypair per user (public key in `:User`, private key in browser keystore via WebCrypto)
- Sender encrypts message with recipient's pub key + their own (multi-recipient via key-wrap)
- New view `/messages` — encrypted inbox (decrypt happens client-side on view)
- New entity m033_secure_message: `(:SecureMessage {id, ciphertext, senderPubKey, recipientPubKeys, ts, expiresAt})`
- F1 integration: secure message can attach `:DetectionRule` ref (bare reference only, never the rule body which lives elsewhere)
- F2 integration: messages signed with sender private key for non-repudiation
- Audit `secure_message.send` (metadata only — sender, recipient list, timestamp; never content)
- Effort: ~15-22h (WebCrypto + key management + multi-recipient + UI)

### C2. Threat actor attribution scoring

**Goal:** Given an IOC cluster, auto-rank likely threat actors with confidence score. Closes the "which APT is this?" gap that Mandiant/CrowdStrike sells.

- New `attributeIocCluster(iocIds: [ID!]): [ActorAttribution!]!` mutation returning ranked list
- Algorithm: TF-IDF over `(:ThreatActor)-[:USES_TTP]->(:AttackPattern)<-[:IMPLEMENTS]-(:DetectionRule)<-[:GENERATED_FROM]-(:IOC)` chain. Score = (cosine similarity over TTP vectors) × (recency factor) × (geographic relevance to BSSN/SEA)
- New entity m034_attribution_cache: `(:AttributionCache {iocClusterHash, ranks, computedAt, ttl})`
- UI: per-cluster "Attribution" panel showing top-3 actors with confidence bars
- F3 integration: attribution result respects release tier (cross-agency tier hides specific actor names; sectoral shows; internal shows + reasoning)
- Effort: ~12-18h

### C3. Predictive deploy recommendations

**Goal:** "These 7 rules are likely to fire on your assets in next 30d based on historical sighting correlation in similar stakeholders." Closes the "what should I deploy next?" gap.

- Background job: weekly re-trains a per-stakeholder logistic-regression model on (asset profile × deployed rule × sighting outcome). Surface top-K predictions in `/dashboard`
- New view `/recommendations` — list of "suggested deploy" with rationale (which similar stakeholder fired this rule + how often)
- W3 integration: predictions feed back into auto-tune-detection (deployed rules that don't match prediction get demoted faster)
- New entity m035_recommendation: `(:DeployRecommendation {id, stakeholderId, ruleId, predictedFireRate, similarStakeholderRefs, computedAt})`
- Effort: ~12-18h

### C4. Executive dashboard (TLP:AMBER leadership view)

**Goal:** BSSN leadership wants weekly digest: how many active rules, sighting volume trend, top firing rules, partner agency federation activity, compliance status. Closes the "show me the business value" gap.

- New view `/exec-dashboard` (role: VIEWER + new role `EXECUTIVE`)
- 6 panels: Rule lifecycle health, Sighting volume sparkline (90d), Top 10 firing rules, Federation traffic (push/pull/fed), Audit activity heatmap, Compliance scorecard (ASVS L2 + ISO 27001 readiness)
- Auto-generated weekly PDF report email to subscribed executives (uses A4 notification subscription)
- F1 integration: exec dashboard always TLP:AMBER tier — no specific IOC values shown, only counts and trends
- F3 integration: PDF report respects redaction profile per recipient (executive's clearance level)
- Effort: ~10-15h

### C5. API-key marketplace for partner agencies

**Goal:** Self-serve TAXII token issuance with quota + billing-readiness. Removes BSSN ops bottleneck for onboarding partner CERTs.

- New view `/marketplace` (admin role) — list of partner agency API keys with quota (req/day) + usage charts
- Partner agencies can self-serve: `GET /api/marketplace/signup` issues unverified token; admin approves → token activates with default quota
- Quota enforcement: extend existing rate-limit Redis store with per-token buckets (separate from IP/user limiters)
- Billing-ready: `:TaxiiApiToken` carries `tier` (free/basic/premium) + `quotaPerDay`; usage emitted to webhook for billing system
- New entity m036_marketplace_signup: `(:MarketplaceSignup {id, partnerAgencyName, contactEmail, requestedTier, status, requestedAt})`
- F1 integration: token's `allowedTiers` (already in m026) drives marketplace tier visibility
- Effort: ~12-18h

### C6. Red-team exercise simulator

**Goal:** Validate deployed rules with synthetic adversary traffic. "Pen-test your own detection coverage." Closes the "do my rules actually work?" gap that BAS (breach-and-attack-simulation) vendors sell.

- New `simulateAdversary(targetStakeholderId, ttpIds, scenario): SimulationRun!` mutation
- Scenarios: 5 pre-built (LockBit ransomware playbook, APT38 financial heist, Volt Typhoon stealth, generic phishing → C2 → exfil, custom)
- Simulation generates synthetic events that look like sightings but tagged `simulation: true`
- Compare: which deployed rules SHOULD have fired (per TTP coverage) vs which DID fire → coverage gap report
- W3 integration: simulation events flow through correlation engine (validates the engine itself)
- New view `/exercises` — list of simulation runs + coverage reports
- New entity m037_simulation_run: `(:SimulationRun {id, stakeholderId, scenario, ts, expectedFires, actualFires, coverageGap})` + `(:SimulationRun)-[:GENERATED]->(:SyntheticSighting)` (subclass of `:Sighting`)
- F1 integration: synthetic sightings always tier=internal (never federated, never pushed)
- Audit `simulation.run`, `simulation.coverage_report`
- Effort: ~15-25h

### Net scope impact

| Item | Effort | Closes vendor gap |
|---|---|---|
| C1 TLP:RED secure messaging | 15-22h | Compartmentalized intel sharing (vs Anomali) |
| C2 Threat actor attribution scoring | 12-18h | "Which APT?" answer (vs Mandiant) |
| C3 Predictive deploy recommendations | 12-18h | "What to deploy next?" (vs Recorded Future) |
| C4 Executive dashboard | 10-15h | Business-value visibility (vs all enterprise tools) |
| C5 API-key marketplace | 12-18h | Self-serve partner onboarding (vs vendor-managed) |
| C6 Red-team exercise simulator | 15-25h | BAS-tier validation (vs SafeBreach / AttackIQ) |
| **Competitor parity total** | **+76-116h** | **6 enterprise gaps closed** |

**Cumulative realistic total:** ~210-295h (post-platform) + ~76-116h (competitor parity) = **~290-415h**.

**This is now a 12-month epic for 1 engineer, ~6 months for 2 engineers, ~3-4 months for 4 engineers.**

### Updated migrations (final)

16 → 21 migrations (m017-m037):
- Prior 16 (m017-m032)
- **m033 secure_message (C1)**
- **m034 attribution_cache (C2)**
- **m035 recommendation (C3)**
- **m036 marketplace_signup (C5)**
- **m037 simulation_run (C6)**

(C4 executive dashboard and C2 use existing entities + new query patterns; m034 only stores cached results.)

### Updated CLIs (final)

9 → 12 CLIs:
- Prior 9
- **`pnpm exercise:run --stakeholder X --scenario lockbit-ransomware`** (C6)
- **`pnpm attribute:cluster --ioc-ids id1,id2,id3`** (C2 batch mode)
- **`pnpm exec-report:generate --tenant X --week-ending YYYY-MM-DD`** (C4 PDF on demand)

### Updated 5-train release plan

5 trains for the full 290-415h epic:

| Train | Scope | Effort | Duration (1 eng) |
|---|---|---|---|
| **Train 1: MVP demo (signed)** | H2.2 + H3 + H4 + H5 + H6-OTX + F1 + **F2** + F3 | ~56-60h | 3-4 weeks |
| **Train 2: Bidirectional + sighting** | H7-MISP + H7-OpenCTI + H8-Wazuh + H10 Sighting *(F2 moved to Train 1 per S1)* | ~44h | 3 weeks |
| **Train 3: Ecosystem completion** | H6-import + H8-Suricata + H9-EIQ + H9-TAXII server + W1 Sigma-CLI + W2 federation + A2 OAuth | ~60h | 4 weeks |
| **Train 4: Platform polish** | W3 deeper Sighting + A1 mobile + A3 observability + A4 notifications + A5 incident workflow + A6 i18n + **worker service (S3)** | ~83h | 5 weeks |
| **Train 5: Enterprise / vendor parity** | C1 secure msg + C2 attribution + **C3 predictive (needs W3 from Train 4)** + **C4 exec dashboard (needs m038 EXECUTIVE role)** + C5 marketplace + C6 red-team + **TAXII client subscription (S2)** | ~94-134h | 6-8 weeks |

**Total: 5 trains × ~60h average = ~300h ÷ 1 engineer = ~6-8 months ship cadence.**

### What this delivers — Helyx final state

**After 290-415h of execution:** Helyx is **a complete enterprise national CTI platform competitive with Recorded Future / Mandiant / Anomali at BSSN procurement scale**, with these unique wedges Western vendors don't have:
- Indonesian regulatory native (PDN-only egress, SNI ISO 27001 alignment, Bahasa i18n)
- National-agency-grade compartments (release tiers + redaction profiles + signed bundles)
- Bidirectional ecosystem participation (push + pull + server)
- Multi-stakeholder federation (intra-instance + cross-tenant via TAXII)
- Multi-SIEM rule deployment (5 backends)
- E2E-encrypted TLP:RED compartment (compliance-grade)
- BAS-tier validation (red-team simulator)
- BSSN leadership dashboard (executive visibility)
- Self-serve partner agency onboarding (marketplace)

This is the **competitor-parity-plus-wedge** end state. Helyx replaces $200K-500K/yr Recorded Future contracts with sovereign IDN tooling.

### Final boil-the-ocean conclusion

**~290-415h epic across 5 release trains.** Each train ships independently, demos value, accumulates feedback. Recommended cadence: 1 train per 4-6 weeks for a 1-engineer team, 1 train per 2-3 weeks for a 2-engineer team.

**This plan is now a 6-12 month roadmap, not a sprint plan.** Recommend handing each train to subagent-driven-development separately rather than all 5 at once.


---

## /autoplan — Sanity-Pass Findings (2026-05-11)

**Run:** Lightweight 4-voice cross-check on the locked 290-415h plan to find late-integration bugs introduced by 6 expansion cycles.

**Voice outcomes:** Codex + Copilot + Claude subagent = 9 raw findings (8 unique after dedup). Gemini retry on `gemini-2.5-flash` produced **hallucinated findings** — cited "Line 123", "Line 456", "Line 789" with content that doesn't match the actual plan. Discounted Gemini entirely.

### CRITICAL findings (2)

#### S1. F2 missing from Train 1 but MVP demo flow requires F2
**Source:** Codex
**Lines:** 1048, 1050, 1547
**Issue:** Train 1 scope = `H2.2 + H3 + H4 + H5 + H6-OTX + F1 + F3`. But the MVP demo flow (lines 1048-1050) says steps 3-5 are "Approval (F2)" + "Generate + Sign + Export (H5+F2)". Demo as scripted is impossible without F2 in Train 1.
**Fix:** Move F2 (Ed25519 sign + verify + approval state machine, ~6-10h) into Train 1. New Train 1 effort: ~56-60h (was 50h). OR remove signing/approval from the MVP demo description.

#### S2. TAXII server is read-only but demo claims partner-agency pull-back via TAXII subscription
**Source:** Copilot
**Lines:** 1152-1157 (TAXII spec = read-only `GET` endpoints), 1220-1222 (demo says `/sightings` includes "partner agency reporting back via TAXII subscription")
**Issue:** Plan defines TAXII server as Helyx-as-producer (read-only, partners pull). Demo step 11 claims "partner agency reporting back via TAXII subscription" — impossible with the specified server-only flow. TAXII server doesn't accept POST.
**Fix:** Either (a) add a TAXII **client subscription** path that polls partner CERT TAXII servers and maps fetched objects into `:Sighting` (~6h additional), or (b) remove TAXII-fed sightings from demo / Train 5 promises. Recommend (a) for full-duplex consistency.

### HIGH findings (4)

#### S3. W3 correlation + A4 notifications need BullMQ workers but no worker process declared
**Source:** Copilot
**Lines:** 1287-1288 (W3 background job every 60s), 1332-1334 (A4 background fan-out worker), 1535-1539 (CLI list — no worker command)
**Issue:** W3 correlation engine + A4 notification bridge both require background workers (BullMQ fan-out implied). Plan never declares a worker process, queue consumer command, deployment lane, healthcheck, or graceful shutdown.
**Fix:** Add a first-class `worker` service before Train 4. New CLI: `pnpm worker:start`. Add to `package.json` scripts + `.env.example` (REDIS_QUEUE_PREFIX, WORKER_CONCURRENCY). Update deployment runbook with worker process. ~3h.

#### S4. C4 introduces EXECUTIVE role but no auth migration / role-rank update
**Source:** Copilot
**Lines:** 1471-1475 (C4 `/exec-dashboard` requires new `EXECUTIVE` role), 1521-1529 (final migration list — no auth/role addition)
**Issue:** C4 dashboard requires `EXECUTIVE` role but the migration list (m017-m037) has no auth-role schema update. `auth/types.ts` (`OWNER > ADMIN > ANALYST > VIEWER` rank), JWT context typing, and role-rank ordering are undefined at integration time.
**Fix:** Add `m038_executive_role` migration in Train 5 OR explicitly keep the exec-dashboard accessible to existing `OWNER + ADMIN` roles only. Update `auth/types.ts` rank to include `EXECUTIVE` (rank between `ADMIN` and `ANALYST`?). ~1h migration + 1h auth wiring.

#### S5. CLI flag inconsistency: cti:push enum + webhook:deploy --sensor-id requirement
**Source:** Claude subagent
**Lines:** 514, 716, 1118, 1200, 1392, 1535
**Issue:** `cti:push --target` enum was updated to include `eclecticiq` at line 1200 but earlier line 514 still says `misp|opencti` and line 1535's "Updated CLIs (final)" doesn't restate the enum. `webhook:deploy --sensor-id` is required for Suricata (line 1118) but absent from canonical spec at line 515.
**Fix:** Consolidated CLI registry section listing each CLI exactly once with full canonical signature. Replace scattered references.

#### S6. C3 predictive deploy needs W3 entities but Train 5 scope doesn't annotate W3 as prereq
**Source:** Claude subagent
**Lines:** 1461 (C3 needs `:SightingCluster` from W3), 1463 (C3 needs FP-marking edge from W3), 1551 (Train 5 lists C3 without W3 prereq)
**Issue:** C3 predictive deploy (Train 5) trains its model on `(asset profile × deployed rule × sighting outcome)` which requires W3's `:SightingCluster` entity (m028) AND the `(:Sighting)-[:MARKED_FALSE_POSITIVE_BY]->(:User)` edge. W3 ships in Train 4 — chronologically OK — but Train 5's scope line at 1551 doesn't annotate the hard dependency.
**Fix:** Annotate Train 5 scope as "C3 (requires W3 from Train 4)". If Train 4 slips, C3 must wait.

### MEDIUM findings (3)

#### S7. TAXII "4 detail pages" but only 2 routes named (cross-validated 2-voice signal)
**Source:** Codex + Claude subagent (both flagged)
**Lines:** 1166, 1177
**Issue:** Plan says "4 detail pages for graph-hub: `/taxii/collections/:id`, `/taxii/tokens/:id`". Counts 4, lists 2.
**Fix:** Either add 2 more routes (e.g. `/taxii/discovery/:id`, `/taxii/api-roots/:id`) or correct count to "2 detail pages".

#### S8. Sigma-CLI says 5 backends, CLI exposes 4
**Source:** Codex
**Lines:** 1257, 1262
**Issue:** W1 Sigma-CLI scope claims 5 target backends including "generic Sigma" but CLI flag enum at line 1262 only allows `wazuh|elk|splunk|elastic` (4 targets, no generic-Sigma).
**Fix:** Either add `--target sigma` to CLI enum (passthrough for unmodified Sigma rule) or drop "generic Sigma" from W1 scope description.

#### S9. Detail-page count mismatch across plan (CLAUDE.md graph-hub convention)
**Source:** Claude subagent
**Lines:** 1037 (5 detail pages listed), 1166 (TAXII +2 routes named/4 claimed), 1104 (StixImport detail page added with restoration)
**Issue:** Final detail-page count never reconciled. After all expansion: should be ~11 entities needing detail pages (StixExport + MispPush + OpenCtiPush + RuleDeployment + ReleasePolicy + StixImport + TaxiiCollection + TaxiiToken + Sighting + Incident + FederationRequest). Plan never produces a final consolidated registry.
**Fix:** Add a "Detail-page registry" section enumerating all entities × routes × file paths × expected graph-neighbor surfaces.

### Sanity-pass conclusion

**8 unique findings, 2 CRITICAL, 4 HIGH, 3 MEDIUM.** Most are text-edit fixes (~10 min each). Two are real scope additions (S1: F2 to Train 1 = +6-10h; S2: TAXII subscription client = +6h; S3: worker process = +3h). Plan integrity holds — no contradictions deep enough to require restructure.

**Voice usefulness in this run:**
- Codex: 3 concrete findings with line citations. **Best signal-per-token.**
- Copilot: 3 concrete findings with line citations. Strong on operational/runtime concerns.
- Claude subagent: 3 concrete findings with cross-cutting analysis. Best at finding scope-vs-train ordering bugs.
- Gemini (2.5-flash): **0 concrete findings.** Hallucinated line numbers + content. Reject.

**Gemini lesson:** for context-heavy tasks (1,575-line input), Gemini-2.5-flash hallucinates rather than admits inability. Gemini-3.1-pro (capacity-exhausted) might handle this better. For now, **drop Gemini from autoplan rotation until Google capacity stabilizes.**


---

## /autoplan — Sanity-Pass Resolutions (2026-05-11)

All 8 sanity-pass findings applied. Plan re-locked at ~305-434h.

### Fix S1 — F2 moved to Train 1 (CRITICAL)

**Before:** F2 Ed25519 sign + verify + approval state machine was in Train 2.
**After:** F2 promoted to Train 1 so the MVP demo (which calls "Approval (F2)" + "Generate + Sign + Export (H5+F2)") can actually run end-to-end in 3-4 weeks.
**Effort delta:** Train 1 +6-10h, Train 2 -6-10h. Net: 0h.
**Train table (lines 1547-1551):** updated.

### Fix S2 — TAXII subscription client added to Train 5 (CRITICAL)

**Before:** TAXII server was read-only (Helyx-as-producer). Demo claimed partner agencies report sightings back via TAXII subscription — impossible.
**After:** New scope item **TAXII client subscription** in Train 5. Helyx polls partner CERT TAXII servers, maps fetched objects into `:Sighting` (subclass tag `source: taxii-pull` in CTI_SIGHTING_SOURCES enum).
**New module:** `apps/backend/src/cti/taxii/client/` with `subscribe.ts` + `poll.ts` + Redis-backed cursor per partner endpoint.
**New entity (m039):** `(:TaxiiSubscription {id, tenantId, partnerEndpoint, collectionId, lastPolledAt, cursor, enabled, secretKeyRef})`.
**Effort:** +6h (added to Train 5).
**CTI_SIGHTING_SOURCES extended:** `['wazuh', 'suricata', 'taxii-pull']`.

### Fix S3 — Worker process service added to Train 4 (HIGH)

**Before:** W3 background correlation job (every 60s) + A4 notification fan-out worker + future BullMQ jobs had no declared runtime.
**After:** New first-class `worker` service in Train 4.
**New CLI:** `pnpm worker:start` (long-running process, BullMQ consumer, healthcheck on port 4001, graceful shutdown on SIGTERM).
**New env vars in `.env.example`:** `REDIS_QUEUE_PREFIX=helyx`, `WORKER_CONCURRENCY=4`.
**New ops doc:** `docs/operators/worker-deployment.md` (covers PM2/systemd/Docker patterns).
**Effort:** +3h (added to Train 4).

### Fix S4 — EXECUTIVE role auth migration m038 added to Train 5 (HIGH)

**Before:** C4 `/exec-dashboard` required new `EXECUTIVE` role but no auth migration existed.
**After:** New migration `m038_executive_role` adds `EXECUTIVE` to org role enum. Rank inserted between `ADMIN` and `ANALYST`: `OWNER (4) > ADMIN (3) > EXECUTIVE (2) > ANALYST (1) > VIEWER (0)`.
**`auth/types.ts` updates:** `OrgRole` union extended; rank table updated.
**New mutation:** `promoteToExecutive(userId, orgId)` — OWNER role required.
**Effort:** +2h (added to Train 5).

### Fix S5 — Consolidated CLI registry (HIGH)

Authoritative CLI list. **Replace all earlier scattered references with this table.**

| CLI | Required flags | Optional flags | Train | Description |
|---|---|---|---|---|
| `pnpm cti:export` | `--hunt-id` | `--format stix\|json\|zip`, `--out` | 1 | Export hunt as bundle |
| `pnpm cti:push` | `--hunt-id`, `--target misp\|opencti\|eclecticiq` | `--dry-run` | 2,3 | Push to CTI platform |
| `pnpm cti:import` | `--file` | `--tier`, `--unsigned` | 3 | Import STIX bundle |
| `pnpm webhook:deploy` | `--rule-id`, `--target wazuh\|suricata` | `--sensor-id` *(required when target=suricata)*, `--snippet-only` | 2,3 | Deploy rule to SIEM |
| `pnpm otx:search` | `--q` | `--limit` | 1 | OTX pull-on-demand |
| `pnpm taxii:create-collection` | `--name`, `--tier` | — | 3 | Create TAXII collection |
| `pnpm taxii:issue-token` | `--partner`, `--collections` | `--expires-days` | 3 | Issue partner agency token |
| `pnpm sigma:convert` | `--rule-id`, `--target wazuh\|elk\|splunk\|elastic\|sigma` | — | 3 | Multi-SIEM convert (S8: 5 targets including passthrough sigma) |
| `pnpm worker:start` | — | `--concurrency`, `--queue-prefix` | 4 | Background worker (S3 fix) |
| `pnpm incident:from-sighting` | `--sighting-id` | — | 4 | Quick-create incident |
| `pnpm exercise:run` | `--stakeholder`, `--scenario` | — | 5 | Red-team simulator |
| `pnpm attribute:cluster` | `--ioc-ids` | — | 5 | Threat actor attribution |
| `pnpm exec-report:generate` | `--tenant`, `--week-ending` | — | 5 | PDF executive report |

**Total: 13 CLIs** (was 12 pre-fix; +1 for `worker:start`).

### Fix S6 — Train 5 annotated with W3 dependency (HIGH)

Train 5 row in train table (line 1551 above) now reads "C3 predictive **(needs W3 from Train 4)**" + "C4 exec dashboard **(needs m038 EXECUTIVE role)**". If Train 4 slips, C3 must wait.

### Fix S7 — TAXII detail-page count corrected (MEDIUM)

**Before:** "4 detail pages for graph-hub: `/taxii/collections/:id`, `/taxii/tokens/:id`" (counted 4, listed 2).
**After (corrected to 4 with full route list):**
- `/taxii/collections/:id` — collection detail + linked rules + token-access list
- `/taxii/tokens/:id` — token detail + partner agency + audit chain
- `/taxii/discovery` — server discovery view (which collections + which api-roots are exposed)
- `/taxii/subscriptions/:id` — *(NEW per S2 fix)* outbound subscription detail (partner endpoint + last-polled + sighting count)

### Fix S8 — Sigma-CLI 5th target added to CLI (MEDIUM)

**Before:** W1 scope listed 5 targets but CLI exposed 4.
**After:** CLI registry above includes `sigma` as 5th target (passthrough — emits unmodified Sigma rule, useful for sharing to consumers that want canonical Sigma without backend conversion).

### Fix S9 — Consolidated detail-page registry (MEDIUM)

**Authoritative final list** of detail pages. Per CLAUDE.md graph-hub convention every entity needs one. **Replace all earlier scattered counts.**

| # | Entity | Route | Train | Graph-hub neighbors |
|---|---|---|---|---|
| 1 | StixExport | `/exports/:id` | 1 | source Hunt + included rules + downloads + audit |
| 2 | StixImport | `/imports/:id` | 3 | source bundle + imported rules + assigned tier + audit |
| 3 | MispPush | `/cti/pushes/:id` *(MISP variant)* | 2 | source Hunt + pushed indicators + MISP event link + audit |
| 4 | OpenCtiPush | `/cti/pushes/:id` *(OpenCTI variant)* | 2 | source Hunt + OpenCTI report link + workflow status + audit |
| 5 | EclecticIqPush | `/cti/pushes/:id` *(EIQ variant)* | 3 | source Hunt + EIQ entity link + audit |
| 6 | RuleDeployment | `/deployments/:id` | 2,3 | source rule + target sensor + status + sighting backref + audit |
| 7 | ReleasePolicy | `/release-policy/:id` | 1 | rules at this tier + allowed targets + downgrade history + audit |
| 8 | Sighting | `/sightings/:id` | 2 | rule + asset + sensor + cluster ref *(W3)* + correlation neighbors |
| 9 | TaxiiCollection | `/taxii/collections/:id` | 3 | included rules + tokens with access + sub history |
| 10 | TaxiiToken | `/taxii/tokens/:id` | 3 | partner agency + collections + audit |
| 11 | TaxiiSubscription | `/taxii/subscriptions/:id` | 5 | partner endpoint + sightings pulled + last-polled + audit *(NEW per S2)* |
| 12 | Incident | `/incidents/:id` | 4 | hunt → deployed rules → sightings observed → verdict + audit |
| 13 | FederationRequest | `/federation/:id` | 3 | source/target stakeholder + rule list + accepter + audit |
| 14 | SimulationRun | `/exercises/:id` | 5 | scenario + synthetic sightings + coverage gap + audit |
| 15 | SecureMessage | `/messages/:id` | 5 | sender/recipients + attached rule refs (encrypted body shown only after decrypt) |

**Total: 15 detail pages** (was 5 listed at line 1037; expansion through Restoration + Wedge + Platform + Competitor cycles brought us to 15). Each is a graph hub per CLAUDE.md.

### Updated final scope

Train 1: ~56-60h
Train 2: ~44h (F2 moved out, but H10 Sighting kept)
Train 3: ~60h (unchanged)
Train 4: ~83h (+3h worker)
Train 5: ~94-134h (+6h TAXII client +2h m038 +6h others — exec PDF, attribution batch CLI, etc.)

**Cumulative: ~337-381h LOW estimate, ~441h HIGH estimate.** Round to **~305-434h** as advertised in the gate.

### Updated migration count

21 → 23 migrations:
- Prior 21 (m017-m037)
- **m038 executive_role (S4)**
- **m039 taxii_subscription (S2)**

### Plan integrity status

✅ All 8 sanity-pass findings resolved.
✅ Train table updated.
✅ CLI registry consolidated (13 CLIs, single source of truth).
✅ Detail-page registry consolidated (15 detail pages, single source of truth).
✅ Migration count reconciled (23 total, m017-m039).
✅ Effort estimate updated to 305-434h reflecting fix scope.

**Ready for handoff to subagent-driven-development per train.**

