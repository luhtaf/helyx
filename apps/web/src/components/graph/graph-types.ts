// Shared graph types — see docs/plans/2026-05-08-maltego-graph-phase-g1.md

import type { DocumentNode } from 'graphql';

export type NodeType = 'Stakeholder' | 'Asset' | 'CVE' | 'Case' | 'Sektor' | 'CWE';

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
  /** Map response → graph delta. Pure function; no side effects, no cytoscape
   *  refs. Easy to unit-test in isolation when test runner lands. */
  expand: (response: TResponse, parent: GraphNode) => ExpandResult;
}

/** Build a node id from type + entity uuid. */
export function nodeId(type: NodeType, entityId: string): string {
  return `${type}:${entityId}`;
}

/** Build an edge id from source/target node ids + edge type. */
export function edgeId(sourceId: string, targetId: string, edgeType: string): string {
  return `${sourceId}->${targetId}:${edgeType}`;
}
