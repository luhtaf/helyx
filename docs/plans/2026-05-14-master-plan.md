# Master plan — Helyx operator + scanner pipeline (2026-05-14)

Audit ulang semua scope outstanding + integrasi vision baru: scanner agents, auto-discovery, inventory inbox, multi-tier ingestion paths.

---

## State of the world (apa yang sudah ada)

### Shipped (live, ke-commit di main)
- **Auth + multi-tenancy** — JWT cookie + CSRF + refresh rotation, OWNER/ADMIN/ANALYST/VIEWER, audit chain (V10 ASVS L2)
- **Stakeholders** — CRUD + reconciliation inbox + sektor mapping + sensor pill (read-only saat ini)
- **Assets** — list + detail + SBOM upload + spiderfoot ingest + tier hierarchy (parent/children) + **NEW: manual add slide-over** (e93b220)
- **CVEs** — NVD daily + ELK bulk + 4 match modes (EXACT/MAJOR_MINOR/MAJOR/BEAST)
- **Cases** — create + close + 11 typed artifacts BE + bulk paste IOC + Wazuh import
- **Hunts** — structured + graph kind + materialize TTP + actor guess + STIX export
- **Detection rules** — generated from hunts + F2 approve/stale/release-tier
- **Graph (Maltego-style)** — 21 transforms, sparse start, varyLimit picker, per-type styles
- **CTI governance** — F1 release tier · F2 Ed25519 sign + rotation + revoke + PEM download · F3a redaction profiles · F3b PDN egress allowlist · H7 push pipeline (MISP live HTTP)
- **Notes** — markdown per-entity (10 types) with audit + DOMPurify + author guard
- **OTX** — on-demand IOC lookup
- **Audit viewer** — `/admin/audit` filter + pagination
- **Cron** — NVD + MITRE daily, k8s-portable

### Gap inventory (ranked by impact)

#### P0 — Operator daily workflow (must-have)
1. **Sensor input form** — `setStakeholderSensor` BE ada, FE ga bisa edit. Operator harus cypher manual.
2. **Add Artifact form (IOC, then 10 types)** — bulk-paste & Wazuh import works, single-add doesn't. Common case: operator adds 1 process/network artifact saat triage.
3. **Inventory review inbox** — review queue buat asset additions/changes (manual + auto-discovered). Mirror reconciliation pattern.
4. **Scanner agent registration + ingest endpoint** — token-auth scanner POSTs scan results, lands di inventory inbox.

#### P1 — Trust + integration depth
5. **Scanner auto-discovery format** — payload schema for `discovered: { k8s:[…], docker:[…], vms:[…], apps:[…] }` → maps to Asset rows with proper hierarchy.
6. **Manual scan upload** — operator drops a JSON/XML scan file → same inbox path.
7. **OpenCTI live HTTP** — H7 brother (~1h, mirror MISP client.ts pattern).
8. **H9 TAXII publisher + EclecticIQ** — multi-protocol push (~2h each).
9. **CVE→Actor relationship** (path-based via TTP overlap) — completes graph transforms.

#### P2 — Org onboarding + scale
10. **Phase Z OAuth/SSO** — Google/Microsoft Sign-in (~6h, enables BSSN/Ditjen Pajak production).
11. **User invite + org membership** — admin add/remove users from org.
12. **CSV bulk import** — Asset/Stakeholder/IOC dari spreadsheet.

#### P3 — Ergonomics + admin
13. **Rule create/update form** — `createDetectionRule`/`updateDetectionRule` ada, FE belum.
14. **Hunt edit metadata** — name/description editable.
15. **Object storage + presigned URL** — buat file artifact blobs (saat ini cuma metadata, ditunda hingga ada need).

---

## Scanner pipeline architecture

### Threat model
- Scanner = untrusted in network, trusted by token. Token compromise = scoped damage (one tenant, one scope, time-bounded).
- Auto-discovered assets ≠ confirmed assets. Operator review gate (inventory inbox) = truth boundary.
- Manual scan upload trust same as scanner: lands in inbox, not directly committed.

### Schema (m026)
```
:Scanner {
  id, tenantId, label, scope (e.g. "acme-prod-k8s"),
  tokenHash (sha256), tokenPrefix (first 8 chars for display),
  status (active|disabled|expired), createdByUserId,
  createdAt, expiresAt (nullable — null=no expiry), lastSeenAt,
  lastIngestAt, totalIngests
}

:ScanReport {
  id, tenantId, scannerId, ts, source (token|manual),
  format (helyx-discovery-v1|trivy-rootfs|cyclonedx|...),
  payloadHash, payloadSize, status (pending|reviewed|rejected),
  itemCount, reviewerUserId, reviewedAt
}

:DiscoveredAsset {
  id, tenantId, reportId, kind, name, hostname, ipAddresses,
  parentDiscoveredId (nullable, for hierarchy from same report),
  status (pending|merged_to_existing|created_new|rejected),
  matchedAssetId (when merged), createdAt
}
```

### Endpoints
- `POST /api/v1/scanner/ingest` — Bearer token in Authorization, JSON payload
  - 401 if token invalid/expired/disabled
  - 429 if rate-limited per scanner
  - 202 with `{ reportId, itemsAccepted }` on success
  - Body: `{ format, items: [{kind, name, hostname?, ipAddresses?, parentName?}] }`
- GraphQL queries (operator UI):
  - `scanners` — list (ANALYST read, OWNER write)
  - `scanReports(filter)` — pending review queue
  - `discoveredAssets(reportId)` — inbox detail
- GraphQL mutations:
  - `createScanner(input)` — returns one-time plaintext token
  - `rotateScanner(id)` — new token
  - `disableScanner(id)`
  - `uploadManualScan(format, payload)` — same inbox path
  - `mergeDiscoveredToExisting(discoveredId, assetId)`
  - `acceptDiscoveredAsNew(discoveredId)`
  - `rejectDiscovered(discoveredId, reason)`
  - `bulkAcceptReport(reportId)` — accept all unflagged

### Flow
```
Scanner agent
  ↓ POST /api/v1/scanner/ingest (Bearer token)
Backend ingest endpoint
  ↓ token verify → ScanReport + N DiscoveredAsset rows (status=pending)
Inventory inbox (/admin/inventory-inbox)
  ↓ operator review → merge / accept-new / reject per-row
  ↓ on accept → createAsset (existing flow) + status=created_new + matchedAssetId
Audit chain: scanner.ingest, inventory.merge, inventory.accept_new, inventory.reject, scanner.rotate, scanner.disable
```

### Security guards
- Token: 256-bit random, stored as sha256 hash; plaintext shown ONCE at create time.
- Per-scanner rate limit (Redis SETEX): default 60 ingests/hour, configurable.
- Expiry: optional `expiresAt`; auto-flips status to `expired` on cron tick.
- F3b PDN egress: scanners are inbound (POST to Helyx), NOT outbound, so F3b doesn't apply directly. But scanner endpoint should validate `X-Forwarded-For` against an optional source IP allowlist per scanner (defer to follow-up).
- Audit every ingest: scanner id, source IP, payload hash, item count.

---

## Build order

Mengikuti "kerjain banyak banyak" — sequential commits, each verified.

### Batch A — operator forms (3 commits, ~1h)
- ✅ A1. Asset manual add (e93b220 — done)
- A2. Sensor input form (per-stakeholder) — modal + setStakeholderSensor mutation wire
- A3. Add IOC artifact form (per-case) — modal + createIocArtifact wire

### Batch B — scanner foundation (5 commits, ~5h)
- B1. m026 schema (Scanner + ScanReport + DiscoveredAsset)
- B2. Scanner CRUD repo + GraphQL (createScanner returns plaintext token once)
- B3. `POST /api/v1/scanner/ingest` REST endpoint (Bearer auth, payload validation, ScanReport+DiscoveredAsset write)
- B4. Inventory inbox UI (`/admin/inventory-inbox` review queue + merge/accept/reject actions)
- B5. Scanner admin UI (`/admin/scanners` list + add + rotate + disable + recent reports)

### Batch C — auto-discovery + manual upload (3 commits, ~3h)
- C1. helyx-discovery-v1 payload format spec + validator
- C2. Manual scan upload UI (file picker → uploadManualScan mutation)
- C3. Discovery hierarchy resolver (parentName → parentDiscoveredId → matchedAssetId chain)

### Batch D — push paths + transforms (3 commits, ~3h)
- D1. OpenCTI live HTTP (mirror MISP pattern)
- D2. H9 TAXII publisher
- D3. CVE.relatedActors transform (path-based via TTP)

### Batch E — admin polish (3 commits, ~3h)
- E1. Rule create/update form
- E2. User invite + org membership UI (deferred until Phase Z lands)
- E3. CSV bulk import (Asset, Stakeholder, IOC)

### Phase Z (separate session, ~6h)
- OAuth2/OIDC SSO (Google + Microsoft + generic)

### Deferred (no current need)
- Object storage + presigned URLs (when file blobs needed)
- Phase R polymorphic stakeholder refactor
- Phase X CVE seeder + daily NVD sync (already shipped)

---

## Conventions (apply to every new feature)

- **Plan first, then code** — write user flow + BE shape + FE pieces + verify steps in plan doc before coding.
- **BE-first** — verify mutation/query via curl before FE wires it up. Catches schema bugs early.
- **Tenant-scoped Cypher** — every MATCH includes `WHERE n.tenantId = $tenantId`.
- **Audit chain** — every sensitive op via `logAudit()`. Action naming: `<entity>.<verb>` lowercase.
- **Role gates** — `assertOrgRole(ctx, '<min>')` at resolver entry.
- **Cypher quirks** — pattern comprehension `|` doesn't work in CREATE-RETURN; denormalize at write-time OR use WITH n trick.
- **Frontend** — composable per feature, no Apollo cache surgery (use `refetchQueries`), useConfirm for destructive actions.
- **Commit per feature** — clean diff, descriptive message with E2E evidence.

---

## Outstanding questions (defer to user)

1. **Scanner = per-stakeholder or per-tenant scope?** Plan assumes per-tenant for v1. Per-stakeholder finer but more complex (need `:Scanner-[:SCANS]->:Stakeholder` edge).
2. **Auto-merge vs always-review?** Plan assumes always-review (inbox). High-confidence matches (exact name+IP overlap) could auto-merge with audit, save operator time. Cek dengan user.
3. **Scanner = client agent (operator runs binary on their network) or pull (Helyx fetches from a configured target)?** Plan assumes push (client agent). Pull adds Helyx-side credentials surface.

Default: assume push + per-tenant + always-review for v1, user can override.

---

## Status addendum (2026-05-18)

Master plan P0–E2 + Phase Z all shipped + e2e-verified. CTI push: all 4
kinds live (MISP, TAXII, OpenCTI, EclecticIQ-via-TAXII). OIDC SSO is
DB-driven + admin-managed (`/admin/sso`). Org member mgmt + revoke
shipped (E2).

**Active build:** Per-type artifact create forms (11 types) for UI v2 —
backend ready (`apps/backend/src/artifacts/`), FE had IOC-only. Building
one generic descriptor-driven modal (DRY SoT) covering all 11 types.

**Queued UX:** Merge reconciliation inbox + inventory inbox into a
single top-right notification bell (drop both from sidebar) — better UX.

**Scope clarifications (owner, 2026-05-18):**
- Scanner agent = separate future **Go** project (not this TS repo).
  SCANNER_BOT role is out-of-scope here. Ingest endpoint side is done.
- Team membership = **in flux** — model moved Org → Stakeholder-centric;
  per-Org Team semantics likely redesigned. Don't build; flag for owner.

**Cross-project workstream — Suricata custom ruleset:**
Separate repo `/Users/fathulikhsan/Project/Rules/Suricata` (rules-only,
not git, Suricata runs elsewhere). Authoritative spec:
`docs/superpowers/specs/2026-05-18-suricata-ruleset-design.md`. 100%
hand-written low-FP Suricata 7.x IDS alert-only ruleset, OWASP Top 10
2021 (minus A04/A09) + infra; PoC + benign negative test per rule; ET
PRO = private offline reference only (never copied). **When working on
Suricata rules, follow THAT repo's spec + CLAUDE.md, not Helyx
conventions.** Tracked here (+ task list #97); not part of the Helyx
codebase.

---

## Status addendum (2026-05-18 pm — session: bugfix + Suricata + Phase R scope)

**Suricata ruleset — substantially built (was DRAFT spec).** 28 rules
across 9 authoring batches, ALL matrix-green (local 8.0.4 + Suricata
7.0.3 + 7.0 containers, zero drift). Phase-2 harness LIVE
(pcap→eve.json auto-assert; manual verification now forbidden per spec
§9 AD1). Two pure-stdlib pcap-builder unlocks: `http_exchange`
(response-side rules) + `tls_client_hello` (tls-meta JA3/JA4). One-cmd
ship gate `scripts/verify-ship.sh` (Phase-1 + Phase-2 matrix + bundle
export + standalone reload). Coverage: OWASP
A01/A02/A03×7/A05/A07/A08/A10, 6 known-CVEs (Log4Shell, Spring4Shell,
Citrix, Confluence, F5, Struts S2-045), recon-http, auth-brute,
webshell, recon-l34, infra-brute, DNS-tunnel, protocol-anomaly,
response-side info-leak, tls-meta SNI-anomaly.

**Helyx bugfix + polish (committed to main):**
- `/admin/members` 500 fixed — null `Membership.joinedAt` on a stray
  edge; hardened `listMembers`/`addMember` with `coalesce(...,o.createdAt)`
  + backfill (4c56a5b).
- `verify2@helyx.test` was wrongly DETACH-DELETEd during that fix
  (mistaken for e2e pollution — it is the primary demo account).
  Restored via idempotent `restore-verify2.ts` (41c61e1); `cred.txt`
  updated. **Lesson:** bug fixes are code+backfill only, never delete
  data judged "pollution".
- Hunt-mode graph header decluttered (11 inline controls → one reusable
  `Dropdown` "Hunt actions" menu) (a75b43b).
- `/rules/:id` 3 governance sections consolidated into one "Release
  governance" card (6470fd4).

**Phase R — SCOPE DIVERGENCE, READ THIS.** Task #86 / "Phase R" has a
formal BREAKING design doc:
`docs/plans/2026-05-08-polymorphic-stakeholder-refactor.md` (Org→
Stakeholder collapse + User.globalRole=NSOC + N-level hierarchy +
ancestorPath + drop `:Organization`; ~1300 LoC; 17.5h; strict
two-release deploy). **That is the real Phase R and it is NOT done.**

What shipped this session instead (f5e39cd) is a `Stakeholder.kind`
discriminator (ORG|SUBUNIT|VENDOR|PERSON|FACILITY, additive m028,
backfill→ORG, backward-compatible, backend-only). This was chosen by
the owner as a deliberate "ga ngubah banyak tapi impactful" lightweight
item — but note the formal Phase R doc explicitly lists `kind` variants
under **"What's NOT in scope"**. So `Stakeholder.kind` is a standalone
small feature, **not** the documented Phase R.

→ Real Phase R (the breaking refactor) remains **DEFERRED**, design
doc intact, pending owner decision on whether/when to execute. Do NOT
treat `Stakeholder.kind` as closing it.
