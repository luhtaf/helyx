# Helyx — Frontend plan

Living plan for the web app. Scope is the dashboard, navigation, and the drill-down pages. Lives outside `CLAUDE.md` because it changes per design iteration; `CLAUDE.md` only learns the load-bearing decisions once they ship.

## Mental model

Two surfaces, two purposes.

**Dashboard = the case view.** Owner's words: "kaya Maltego atau case." This is the *investigation* surface — you change the lens (match mode) and the data redraws. Wide → narrow, narrow → wide. Match mode lives **only here**. Everything else accepts a fixed reality.

**List & detail pages = the ledger.** Concrete views of one entity (an asset, a CVE, a component). These don't carry a match mode toggle. They show what's actually linked, in the broadest mode (BEAST), so navigation never makes a result vanish. Severity, score, asset count are facts.

## Drill-down rules

Almost everything on the dashboard is clickable. The pattern: a number or row → a list scoped by that number; a row in a list → its detail; the detail surfaces inverse links back.

| Clicked | Goes to | Scope |
| --- | --- | --- |
| Asset count tile | `/assets` | all assets in org |
| `assetsByKind` row (e.g. CONTAINER 2) | `/assets?kind=CONTAINER` | filtered list |
| Component count tile | `/components` (later) | all components |
| Severity number (e.g. CRITICAL 12) | `/cves?severity=CRITICAL` | filtered CVE list |
| Total CVE number | `/cves` | full CVE list, current match mode preserved as URL param |
| CVE row in "what needs attention" | `/cves/:id` | CVE detail |
| Asset name in any list/detail | `/assets/:id` | asset detail |
| Sidebar nav numbers | their respective list pages | — |

The dashboard does not carry CVE detail in a side panel. It always navigates. Stops the page from becoming a card sea.

## Routes

```
/                    Dashboard (case view, match mode lives here)
/login               Auth
/assets              Asset list (filter: kind, search, severity-impact)
/assets/:id          Asset detail (tree, components, CVEs)
/cves                CVE list (filter: severity, search by id, optional mode param)
/cves/:id            CVE detail (description, CVSS, affected assets in this org)
/components          (deferred — not in this iteration)
/hunts               (deferred)
/threat-actors       (deferred)
```

## Design direction — Forensic Ledger

Skill brief lives at `frontend-design` output; load-bearing summary:

- **Type inversion**: `JetBrains Mono` is the dominant face (numbers, IDs, labels, sidebar). `Inter Tight` is reserved for prose only.
- **Color** (warm dark, paper-in-candlelight): `--bg #0b0a08`, `--surface #14120e`, `--ink #e8e3d6`, `--ink-dim #8a8273`, `--rule #1d1a14`. Severity as muted pigments: `--crit #e07254`, `--high #d49656`, `--med #c5b572`, `--low #7d9474`.
- **No card sea.** Sections are separated by hairline `<hr>` with an inline tiny mono label. Page background = section background. Cards survive only in modals/login.
- **Severity is the visual.** Three places color earns its keep: masthead numbers (huge mono in severity color), proportional bar (full-width 6px segmented by counts), CVE row left rule (2px vertical edge in severity color).
- **Asymmetric layout.** Content max ~1080px, left-aligned, NOT centered.
- **Microcopy**: `Top vulnerabilities` → `what needs attention`; `Asset breakdown` → `inventory`; `System` → footer line `api ●  graph ●  synced 14:32`.
- **Sidebar**: numbered TOC (`01  Overview`), no unicode glyphs, single dot indicator for active row.

## Component changes (web)

| File | Action |
| --- | --- |
| `components/ui/StatTile.vue` | **delete** — masthead numbers are inline, not boxed |
| `components/ui/Card.vue` | keep — used in Login only |
| `components/ui/SeverityBadge.vue` | replace with `SeverityWord.vue` (colored mono text only, no chip) |
| `components/layout/Sidebar.vue` | rewrite — numbered nav, no glyphs, hairline separators |
| `components/layout/AppShell.vue` | minor — drop `bg-neutral-950`, use `--bg`; sidebar 200px, content max-w-[1080px] left-aligned |
| `views/DashboardView.vue` | rewrite — masthead + severity bar + "what needs attention" stack + "inventory" mini-bars + footer line |
| `views/AssetsView.vue` | implement — typographic table, filter by kind/search, click row → detail |
| `views/AssetDetailView.vue` | implement — header with id, components list, CVEs table, parent/children tree |
| `views/CvesView.vue` | new — typographic CVE table, filter by severity (URL param), pagination by cursor |
| `views/CveDetailView.vue` | new — CVE meta, affected assets table, references list |
| `assets/main.css` | add CSS variables, load Inter Tight font, optional grain overlay |

## Backend gaps to fill before list/detail pages

| Need | Status | Notes |
| --- | --- | --- |
| `tenantStats` | ✅ shipped | masthead source |
| `assets(kind, search, limit)` | ✅ shipped | list page source |
| `asset(id)` | ✅ shipped | detail page source |
| `tenantCves(filter)` | ❌ TODO | CVE list page; needs `severity`, `search`, `mode`, cursor pagination |
| `cve(id)` | ❌ TODO | CVE detail core fields (id, description, CVSS, weaknesses, references) |
| `cve.affectedAssets(orgId)` | ❌ TODO | inverse link — which tenant assets touch this CVE; needs DataLoader if exposed in lists |
| Component browse (`/components`) | deferred | — |

## Detail page convention — graph-native related entities

Every detail page is a **graph hub, not a leaf**. OpenCTI register: from a CVE you can pivot to assets, weaknesses, references, threat actors that exploit it, IOCs, detection rules. From an IOC: to TTPs, threat actors, rules, observed assets. From a ThreatActor: to TTPs, IOCs, rules, targeted CVEs, campaigns. The graph IS the navigation; detail pages must surface the neighbours.

Convention for every detail page (apply now and as new entity types land):

1. **Header** — entity identity (id, primary attributes, status). Top of page.
2. **Primary relations** — typed sections, hand-curated per entity type, that surface the load-bearing edges. For CVE: affected assets, weaknesses, references, affected CPEs. For Asset: parent, children, components, CVEs (per match mode). For ThreatActor (later): TTPs, IOCs, related CVEs. Each section is a typographic table with click-through.
3. **(Later, Pattern C) Generic graph neighbours panel** — when a 4th+ entity type lands, add a `relations` GraphQL field that returns a typed-union list of *any* connected node, grouped by edge type. UI: collapsible "Related" section at the bottom of every detail page, each row routes to its detail. Skip until needed; don't over-engineer with one entity.

UI primitive needed (when implementing CVE detail): `RelatedRow.vue` — single line with entity-type prefix (mono, dim), entity title (sans), small inline metadata (count / mode / score). Reusable across all detail pages so the visual language is identical regardless of entity type.

## Open questions (locked answers from owner)

| Q | Answer |
| --- | --- |
| Pagination strategy | Page-numbers default; cursor only for unbounded growth (per-asset components, audit logs). See pagination table in "Routes". |
| Match mode label on affected assets | Yes — small mono 10 px in dim color. Analyst needs EXACT vs BEAST distinction for triage; not visually dominant. |
| Components page (`/components`) | Defer until first user complaint. License/SBOM-diff use case is real but not core vuln workflow. |
| CVE search | ID-only first. Full-text index `cve_search` already exists, gate behind toggle when description-search is requested. |
| Footer "last sync" | NVD `lastSyncCompletedAt` (delta freshness is load-bearing). Hover tooltip: `NVD daily 14:32 · ELK bulk 2026-04-22`. Omit ELK line if never run. |

## Pagination per surface

| Surface | Strategy | Growth shape |
| --- | --- | --- |
| `/cves` | page-numbers | bounded — tenant-scoped |
| `/cves/:id` affected assets | page-numbers | < 100/CVE/org realistic |
| `/assets` | page-numbers | 1k–10k tier |
| asset detail → CVE list | page-numbers | bounded by tenant CPE links |
| asset detail → components | **cursor** | 5k+ realistic for Trivy rootfs |
| audit log / scan history (later) | **cursor** | append-only, unbounded |

## Match mode propagation

Match mode is dashboard-local UI state by default (Vue ref). Two cases where it crosses pages:

1. Dashboard user clicks "Total CVEs (mode: MAJOR)" → `/cves?mode=MAJOR`. The CVE list respects the URL param. From inside `/cves`, the user can change mode via a small inline picker (same component as dashboard's). This is the only list/detail with a mode picker.
2. Dashboard severity tiles → `/cves?severity=CRITICAL&mode=<current>`. Same.

Asset detail's `cves(mode)` resolver still accepts mode — the asset detail page has its own picker too (since asset-level CVE matching is a real investigation question, not a global lens).

## Order of execution

1. **Backend additions**: `tenantCves`, `cve(id)`, `cve.affectedAssets`. (~30 min — same patterns as `tenantStats`.)
2. **Design system**: CSS variables, Inter Tight, severity colors. Strip `tracking-[0.18em]` overuse.
3. **AppShell + Sidebar rewrite**.
4. **Dashboard rewrite** (no cards, masthead + severity bar + stack + footer).
5. **CVE list + detail** (typographic tables).
6. **Asset list + detail** (typographic tables).
7. **Cross-link wiring** — every clickable thing routes properly.

Each step is independently shippable and verifiable in browser.

## Open questions for the owner

1. CVE list pagination — cursor (best for graph-DB) or page-numbers (worse perf, easier UX)? Default plan: cursor, with "load more" button.
2. CVE detail "affected assets" — should the asset rows there show which mode matched (EXACT vs BEAST) or just the fact of match? Default plan: show match mode label inline, dim if BEAST/wider.
3. Components page (`/components`) — useful enough to build now, or wait for first user complaint? Default plan: defer.
4. Search in CVE list — by CVE id only, or also full-text on description (fulltext index `cve_search` already exists)? Default plan: id-only first, full-text behind a toggle later.
5. The footer telemetry line — is the synced timestamp the last NVD sync or last ELK bulk? Default plan: latest of both, labeled `last sync 14:32`.
