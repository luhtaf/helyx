# Maltego-style Interactive Graph — Phase G1

> Date: 2026-05-08 · Branch: main · Status: PROPOSED

**Goal:** Ship an interactive, lazy-loaded graph viewer that lets analysts explore the Helyx data model the way Maltego users do — start from a seed entity, right-click to "transform" (enrich) one hop at a time. Avoid the upfront-load-everything model that makes graph UIs feel heavy.

**Why now:** The Hunt feature in CLAUDE.md was always specified as "Maltego-style expandable graph view." Pre-assessment data (Stakeholder + 60+ assets + 4631 ATTRIBUTED_CVE edges) is now rich enough to be worth visualizing. Static detail pages can't show cross-entity relationships well; analysts need a workspace where Stakeholder ↔ Asset ↔ CVE ↔ Case relationships are first-class.

**Tech:** Cytoscape.js + cose-bilkent layout. ~150KB gzipped. Force-directed, incremental add/remove, native right-click hook. Battle-tested in OpenCTI and many threat-intel tools.

**Architecture intent:**
- ONE seed node renders initially (`/graph?seed=<type>:<id>`)
- Right-click any node → context menu of "transforms" applicable to that node type
- Clicking a transform fires a focused GraphQL query, adds returned nodes/edges, runs incremental layout
- Hard cap 200 visible nodes (warn user if reached); hidden-node action lets users prune
- Hunt save/load deferred to Phase G2 — Phase G1 is read-only graph + transforms

---

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Graph viz core | `cytoscape@^3.30` | Mature, force layout, incremental add, native right-click, well-typed |
| Layout algo | `cytoscape-cose-bilkent@^4.x` | Force-directed with cluster-aware positioning, plays well with progressive add |
| Vue wrapper | None — direct `cytoscape()` instance owned by `<HelyxGraph>` | Existing Vue wrappers (cytoscape-vue) are stale; thin direct binding is ~50 LoC and avoids upstream churn |
| Context menu | Plain Vue component positioned at `cy.on('cxttap')` event coords | Cytoscape's own context-menu plugin pulls jQuery; we don't need that baggage |
| Node icons | Inline SVG sprites in `assets/graph-icons/` | No webfont dep; keeps icons crisp at zoom |

---

## Schema additions (backend)

The graph traverses entities we already query via REST/GraphQL. Phase G1 needs no new resolvers — the existing typed fields are enough:

| Node type | Available transforms (existing queries) |
|---|---|
| Stakeholder | `assets`, `cves(mode)`, `cases`, sektor (single-link) |
| Asset | parent stakeholder via `MATCH (s)-[:OWNS]->(a)`, `cves(mode)`, attributed CVEs |
| CVE | other affected assets in tenant via `affectedAssets`, weaknesses (CWE), references |
| Case | stakeholder, artifacts |
| Sektor | stakeholders in this sektor |

If transforms grow to need a query that doesn't exist (e.g., "show CVEs that share a CWE with this CVE"), add it in a follow-up — Phase G1 ships with 4 entity types × ~3 transforms each = ~12 transforms reusing existing fields.

**One read-side helper that DOES need adding:** `Asset.stakeholder` resolver — currently no inverse traversal from Asset → owner. Used by Asset's "Show parent stakeholder" transform. ~10 LoC.

---

## File layout (frontend)

```
apps/web/src/
  views/
    GraphView.vue                  ← /graph?seed=<type>:<id> entry point, ~120 LoC
  components/graph/
    HelyxGraph.vue                 ← cytoscape instance + layout + node/edge styles, ~250 LoC
    ContextMenu.vue                ← positioned div with transform list, ~80 LoC
    NodeDetailDrawer.vue           ← right-side detail panel for selected node, ~100 LoC
    transforms.ts                  ← registry: NodeType → Transform[], ~150 LoC
    cytoscape-styles.ts            ← node/edge style definitions per type, ~100 LoC
    graph-types.ts                 ← shared types (NodeType, GraphNode, etc), ~60 LoC
  composables/
    useGraphTransform.ts           ← loadable that runs a transform GraphQL query, ~80 LoC
```

Total ~940 LoC frontend. No backend changes beyond the `Asset.stakeholder` field.

---

## Data shapes

```ts
// graph-types.ts
export type NodeType = 'Stakeholder' | 'Asset' | 'CVE' | 'Case' | 'Sektor';

export interface GraphNode {
  id: string;            // unique cy node id: `${type}:${entityId}`
  entityId: string;      // backing entity UUID
  type: NodeType;
  label: string;         // display
  data?: Record<string, unknown>; // typed metadata for tooltip/drawer
}

export interface GraphEdge {
  id: string;            // `${sourceId}->${targetId}:${edgeType}`
  source: string;
  target: string;
  edgeType: string;      // e.g. 'OWNS', 'AFFECTED_BY', 'IN_SEKTOR'
  label?: string;
}

export interface Transform {
  id: string;            // unique key for cycle prevention
  label: string;
  description?: string;  // shown on hover
  appliesTo: NodeType;
  query: DocumentNode;
  // Maps GraphQL response → new nodes/edges to add. Returned items
  // already de-duped against existing graph state inside HelyxGraph.
  expand: (response: unknown, parent: GraphNode) => {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}
```

---

## Transform registry (Phase G1 set)

12 transforms across 4 node types. Each is read-only — Phase G1 doesn't mutate.

| Type | Transform | Yields | Default cap |
|---|---|---|---|
| Stakeholder | Show owned assets | Asset nodes + OWNS edges | 50 |
| Stakeholder | Show CVEs (chain) | CVE nodes + AFFECTED_BY edges | 25 |
| Stakeholder | Show CVEs (scanner) | CVE nodes + ATTRIBUTED edges | 25 |
| Stakeholder | Show cases | Case nodes + TARGETED_BY edges | 20 |
| Stakeholder | Show sektor | Sektor node + IN_SEKTOR edge | 1 |
| Asset | Show parent stakeholder | Stakeholder node + OWNS edge | 1 |
| Asset | Show CVEs (this asset) | CVE nodes | 25 |
| Asset | Show siblings (same stakeholder) | Asset nodes | 20 |
| CVE | Show other affected assets | Asset nodes (across tenants disabled — tenant-scoped only) | 50 |
| CVE | Show weaknesses (CWE) | CWE nodes | 5 |
| Case | Show targeted stakeholder | Stakeholder node | 1 |
| Case | Show artifacts | Artifact nodes | 25 |

**Caps prevent runaway expansion.** A transform that would return more than its cap surfaces a "showing 50 of 230 — refine and click again" affordance.

---

## Layout strategy

- **Initial render:** seed node at viewport center, no layout needed
- **After each transform:** run `cose-bilkent` only on newly-added nodes + their immediate neighbors (`fit: false, animate: 'end', randomize: false`). Existing nodes stay put. Avoids the "everything jumps" feel of full relayout.
- **User-pinned positions:** double-click a node → toggles `locked: true`. Locked nodes don't move during incremental layout.
- **Reset action:** "Re-layout all" button runs cose-bilkent across the whole graph for users who want a fresh arrangement.

---

## Node/edge styling

| NodeType | Color (warm dark palette) | Shape | Icon |
|---|---|---|---|
| Stakeholder | `--signal` (#c8b07a) warm gold | rounded-rect | building |
| Asset | `--ink` neutral | hexagon | server / globe (per kind) |
| CVE | severity color (`--sev-crit/high/med/low`) | diamond | shield |
| Case | `--sev-high` for ACTIVE, `--ink-dim` for DRAFT | rounded-rect | folder |
| Sektor | `--ink-faint` | rounded-rect | tag |

Edge style: thin stroke colored by `--rule` for structural (OWNS, IN_SEKTOR), `--sev-high` for AFFECTED_BY, `--sev-med` for ATTRIBUTED. Edge label only shown on hover (avoid clutter at default zoom).

---

## Routes

```
/graph                               ← empty state: prompt to enter a seed
/graph?seed=stakeholder:<id>         ← entry from Stakeholder detail page
/graph?seed=asset:<id>               ← entry from Asset detail page
/graph?seed=cve:<id>                 ← entry from CVE detail page
/graph?seed=case:<id>                ← entry from Case detail page
```

Each detail page gets a single "Open in graph →" button in the header that builds the URL and navigates.

---

## RBAC

`requiresRole: 'VIEWER'` — anyone authed in the active org can view. Transforms inherit the existing per-resolver `assertOrgRole(ctx, 'VIEWER')` checks. No new privilege boundary.

---

## Implementation steps

| # | Step | Files | LoC | Effort |
|---|---|---|---|---|
| G1.1 | Add cytoscape + cose-bilkent deps + import map | `apps/web/package.json` | 2 | 5m |
| G1.2 | Create graph-types.ts (NodeType, GraphNode, GraphEdge, Transform) | `components/graph/graph-types.ts` | 60 | 15m |
| G1.3 | Build HelyxGraph.vue shell (cy instance + container + lifecycle) | `components/graph/HelyxGraph.vue` | 250 | 60m |
| G1.4 | cytoscape-styles.ts — per-type node/edge styling | `components/graph/cytoscape-styles.ts` | 100 | 30m |
| G1.5 | ContextMenu.vue — positioned over right-click coords | `components/graph/ContextMenu.vue` | 80 | 25m |
| G1.6 | transforms.ts — 12 transforms with GraphQL docs + expand fns | `components/graph/transforms.ts` | 150 | 60m |
| G1.7 | useGraphTransform.ts — composable, single-flight per transform-id | `composables/useGraphTransform.ts` | 80 | 20m |
| G1.8 | NodeDetailDrawer.vue — right panel showing selected node properties | `components/graph/NodeDetailDrawer.vue` | 100 | 25m |
| G1.9 | GraphView.vue — route entry, seed parsing, layout orchestration | `views/GraphView.vue` | 120 | 30m |
| G1.10 | Add `/graph` route to router with VIEWER guard | `router/index.ts` | 8 | 5m |
| G1.11 | "Open in graph →" button on 4 detail pages | per detail view | 4×6 | 15m |
| G1.12 | Backend: add `Asset.stakeholder` field + resolver | `assets/schema.ts`, `assets/resolvers.ts` | 15 | 15m |
| G1.13 | Manual smoke test (browse): seed=stakeholder → expand → cap warning | n/a | 0 | 20m |

Total ~5h. Sequence: G1.12 first (backend before frontend), then G1.1-G1.10 in two passes, then G1.11 wiring, then G1.13 verify.

---

## What's NOT in scope (Phase G1)

- **Hunt save/load** — graph state persisted as a `:Hunt` node so users can resume. Migration m007 already has `:Hunt`. Wire-up in Phase G2.
- **Path search** — "shortest path between X and Y" via Cypher `shortestPath()`. Phase G3.
- **Bulk select + bulk attribute** — select N nodes, run a Cypher Cypher write. Phase G3+.
- **Cluster/hide by sektor or time** — facet-style filtering. Phase G2.
- **Export PNG / JSON** — `cy.png()` is one-liner; defer to G2 polish pass.
- **WebGL renderer** for 1000+ node graphs — current canvas renderer fine to ~500 nodes; revisit only if perf complaints.
- **Custom transform plugins** (Maltego "transform marketplace") — way later.
- **Realtime updates** when underlying data changes — full reload on user action; live updates via subscription is a separate phase.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| User runs transforms recursively → 1000+ nodes → browser stalls | Hard cap 200 visible. Reach cap → button to "hide oldest 50". |
| Same entity hit by multiple transforms → duplicate nodes | Cy node id = `${type}:${entityId}`. Cytoscape's `cy.add()` is idempotent on duplicate id. De-dupe is free. |
| Transform fails (network, auth) → confusing UX | useGraphTransform.ts shows toast on error, doesn't add nodes. Drawer keeps showing loading state until error. |
| Layout jumps annoy users | `randomize: false`, scope layout to new+immediate-neighbors only, preserve user-pinned positions. |
| Cytoscape bundle adds 150KB to web build | Acceptable; web app is internal/SOC tool, not public. Lazy-load via dynamic import on /graph route only. |
| Apollo cache miss for repeated transforms | each transform query uses `fetchPolicy: 'cache-first'` so re-running same transform on same node hits cache. |

---

## Verification plan

After G1.13 build:
1. Login `verify2@helyx.test` / `VerifyPass123!`, switch to DJP org
2. Navigate to Stakeholder detail (Lembaga Administrasi Negara) → click "Open in graph"
3. /graph?seed=stakeholder:<id> renders 1 node (gold rounded-rect, building icon)
4. Right-click → "Show owned assets" → 1 asset hexagon node + OWNS edge appears, layout settles
5. Right-click asset → "Show CVEs (this asset)" → 14 diamond CVE nodes appear, severity-colored
6. Right-click CVE → "Show other affected assets" → if cap is 50, fan out shows tenant-scoped affected assets
7. Verify hard cap: trigger expansion that would breach 200 → warning toast, expansion truncated
8. Re-layout button works
9. Drawer shows selected node detail
10. Vue-tsc clean across web

---

## Phase G2 preview (next session, NOT this plan)

- Hunt save/load: `mutation saveHunt($graph: GraphSnapshotInput!)` writes to `:Hunt`, /hunt list page restores via `query hunt($id)`
- Cluster by sektor: collapse N stakeholder nodes of same sektor into one supernode (toggle)
- Time filter: "show only edges/nodes seen in last 30d"
- PNG export
- Path search modal

---

## Pre-Execute Revision Delta (post-review)

After dual-voice review (Claude subagent — Codex auth 402, single-voice mode), 2 CRITICAL + 5 HIGH issues were addressed by amending the plan in-place. Summary of changes:

### CRITICAL fixes baked into the plan

**C1 — cose-bilkent does NOT have partial-layout API.** Plan claimed "scope layout to new+immediate-neighbors". cose-bilkent runs against whatever collection you `.layout()` on, but doesn't preserve unrelated node positions. The "existing nodes stay put" behavior requires explicit lock/unlock.
- **Action**: G1.3 layout helper in HelyxGraph.vue must do `cy.nodes().not(newNodes).lock()` BEFORE running layout, `.unlock()` AFTER. OR switch to `cytoscape-fcose` which has documented incremental mode (`randomize: false, quality: 'proof', incremental: true`).
- **Decision**: switch dep to `cytoscape-fcose@^2.x` (replacement, similar size, supports incremental). Update G1.1.

**C2 — `Asset.stakeholder` resolver cardinality not specified.** `(Stakeholder)-[:OWNS]->(Asset)` schema has no 1:1 constraint. Asset with 0 owners returns null; with 2 owners returns arbitrary one.
- **Action**: G1.12 ships as `Asset.stakeholder: Stakeholder` (singular nullable) with a `WARN` log emitted when `count(owner) > 1`. Future `Asset.stakeholders: [Stakeholder!]!` plural can be added if data drift becomes common — non-breaking.

### HIGH fixes baked into the plan

**H1 — HelyxGraph.vue overrun risk at 250 LoC.** Already tight under CLAUDE.md ceiling.
- **Action**: extract `composables/useCytoscape.ts` for cy lifecycle + destroy + style binding (~80 LoC). HelyxGraph.vue stays ~120 LoC for template + event handlers. New step **G1.3a**.

**H2 — `cy.destroy()` lifecycle on route param change.** Vue may reuse component when query param changes.
- **Action**: useCytoscape.ts watches seed change and calls `cy.destroy()` + re-init. Plus `onBeforeUnmount` guard. Plus `cy.removeAllListeners()` defensively. Tracked in G1.3a.

**H3 — Tenant switch leaves stale cross-tenant data on screen.** `activeOrgId` change must reset graph.
- **Action**: GraphView.vue `watch(authStore.activeOrgId, () => resetSeed())`. New step **G1.9a**, ~10 LoC.

**H4 — Cap is per-instance; multi-tab = N×200.** Browser WebGL/canvas pressure.
- **Action**: documented as per-instance behavior in `## Risks & mitigations`. Add `## Multi-tab` note: when 3+ `/graph` tabs detected via BroadcastChannel, show passive warning. Phase G1 keeps the 200-node hard cap; warning UI is best-effort.

**H5 — Layout cost blocks input.** cose-bilkent (now fcose) on 100 nodes is 600-1000ms.
- **Action**: useCytoscape.ts wraps layout in `requestIdleCallback` with `timeout: 200`. Show indeterminate progress on the affected subgraph during layout. New helper in G1.3a.

### MEDIUM fixes (smaller, accepted as-is in plan)

- **M1**: `/graph` empty state = list of last 5 stakeholders + search box (added to G1.9 spec).
- **M2**: Seed permission/404 → empty-state with toast "entity not found or no access" (added to G1.9 spec).
- **M3**: 0-result transform → toast "No results for <transform>" (added to G1.7 useGraphTransform.ts spec).
- **M4**: Refresh mid-exploration loses state — moved to "What's NOT in scope" explicitly (was buried).
- **M5**: Test extractability — `enforceCap()` and transform `expand` functions stay pure + extracted to standalone files for future test-runner adoption.
- **M6**: When transforms.ts > 250 LoC OR > 15 transforms, split per-NodeType. Note in transforms.ts header comment.
- **M7**: ContextMenu.vue uses `evt.renderedPosition` not `position`. Spec note added to G1.5.

### LOW (no-op or trivial)

- **L1**: Confirmed `CVE.affectedAssets` is tenant-scoped via `parent.__tenantId`. No action.
- **L2**: cytoscape-fcose self-registers — guard with module-level flag against HMR re-import.
- **L3**: `Transform<TResponse>` generic instead of `unknown`. ~5 min.
- **L4**: Edge id idempotency note in graph-types.ts.

### Updated step list

```
G1.1   Add cytoscape + cytoscape-fcose deps                       5m  (was cose-bilkent)
G1.2   graph-types.ts (Transform<TResponse> generic)              15m (was Transform unknown)
G1.3   HelyxGraph.vue (template + event handlers, ~120 LoC)       40m (was 60m)
G1.3a  useCytoscape.ts composable (lifecycle + lock/unlock        45m NEW
       around fcose layout + idle-callback + style bindings,
       ~120 LoC)
G1.4   cytoscape-styles.ts                                        30m
G1.5   ContextMenu.vue (renderedPosition)                         25m
G1.6   transforms.ts (12 transforms, <Transform<TResp>>)          60m
G1.7   useGraphTransform.ts (single-flight + 0-result toast)      25m (+5m)
G1.8   NodeDetailDrawer.vue                                       25m
G1.9   GraphView.vue (empty state, 404 path, seed validation)     45m (was 30m)
G1.9a  Tenant-switch watcher in GraphView.vue                     10m NEW
G1.10  Add /graph route w/ VIEWER guard                           5m
G1.11  "Open in graph →" button on 4 detail pages                 15m
G1.12  Backend: Asset.stakeholder + cardinality warn              20m (was 15m)
G1.13  Manual smoke test (verify lock/unlock, idle layout,
       tenant switch reset, 404 path, 0-result toast)             30m (was 20m)
```

Total revised: ~6.5h (was 5h). 1.5h delta absorbs the 2 critical fixes that are non-negotiable + UX completeness for empty/error/0-result paths.
