// Shared graph types — see docs/plans/2026-05-08-maltego-graph-phase-g1.md

import type { DocumentNode } from 'graphql';

// AttackPattern + ThreatActor + Artifact + DetectionRule were added when
// H3 materializeTtpHunt landed — the materialize repo emits nodes with
// these types, but the union was missing them so TS couldn't catch the
// drawer/style references. CtiIoc added for W2.5 indicator nodes once
// they get rendered in the graph.
export type NodeType =
  | 'Stakeholder'
  | 'Asset'
  | 'CVE'
  | 'Case'
  | 'Sektor'
  | 'CWE'
  | 'AttackPattern'
  | 'ThreatActor'
  | 'DetectionRule'
  | 'Artifact'
  | 'CtiIoc'
  | 'Hunt';

export interface GraphNode {
  /** Unique cytoscape node id: `${type}:${entityId}`. Idempotent — same id
   *  passed to cy.add() twice no-ops the second time, which means transforms
   *  yielding overlapping neighbors don't create dupes. */
  id: string;
  /** Backing entity UUID (without the type prefix). */
  entityId: string;
  type: NodeType;
  label: string;
  /** Typed metadata for tooltip/drawer rendering. Each NodeType has its own
   *  shape — drawer narrows by .type. Keep small (display fields only). */
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  /** Edge id pattern: `${sourceId}->${targetId}:${edgeType}`. cytoscape
   *  cy.add() is idempotent on duplicate id. */
  id: string;
  source: string;
  target: string;
  edgeType: string;
  label?: string;
}

export interface ExpandResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** When backend returned more rows than the cap, this is the total —
   *  UI shows "showing N of M" affordance. Undefined when uncapped. */
  totalAvailable?: number;
}

/**
 * A Transform is a typed enrichment action for a single NodeType. The query
 * is dispatched with `{ id: parent.entityId }` (or the variables in `vars`),
 * the response is shaped by `expand` into nodes/edges, and the result is
 * additively merged into the graph via cy.add (idempotent on dup ids).
 *
 * Generic over TResponse so each transform owns its query shape — no `unknown`
 * casts inside `expand`.
 */
export interface Transform<TResponse = unknown> {
  /** Stable key for cycle prevention + single-flight in useGraphTransform. */
  id: string;
  label: string;
  description?: string;
  appliesTo: NodeType;
  query: DocumentNode;
  /** Soft cap on returned nodes. Backend may return more; truncated client-
   *  side and surfaced via ExpandResult.totalAvailable. */
  cap: number;
  /** Optional list of size choices for an inline 'how many?' picker on
   *  the context menu. Right-click → see [10] [25] [50] [All ≤cap]
   *  before fetch instead of dumping cap-sized result on first click.
   *  Pass the chosen limit as a `limit` variable to the query. */
  varyLimit?: number[];
  /** Map response → graph delta. Pure function; no side effects, no cytoscape
   *  refs. Easy to unit-test in isolation when test runner lands.
   *  When `limit` is set, expand may need to client-slice if the BE field
   *  doesn't accept a limit arg. */
  expand: (response: TResponse, parent: GraphNode, limit?: number) => ExpandResult;
}

/** Build a node id from type + entity uuid. */
export function nodeId(type: NodeType, entityId: string): string {
  return `${type}:${entityId}`;
}

/** Build an edge id from source/target node ids + edge type. */
export function edgeId(sourceId: string, targetId: string, edgeType: string): string {
  return `${sourceId}->${targetId}:${edgeType}`;
}
