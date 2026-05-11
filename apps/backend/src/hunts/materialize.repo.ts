// H3 — TTP-seed materialize. Given a technique (and optionally a threat
// actor scope per Owner's spec), compute facet counts FIRST so the UI
// can show "1,847 matches → refine" before fetching nodes. Hard cap is
// silent data loss per Eng review.
//
// Lives in its own file to keep hunts/repo.ts under the file ceiling
// (was already at 406/500 lines pre-Train-1 per Eng review).

import { getSession } from '../db/neo4j.js';

export interface TtpFacets {
  techniqueId: string;
  techniqueName: string | null;
  actorCount: number;       // :IntrusionSet using this TTP (filtered by actorId if set)
  stakeholderCount: number; // tenant stakeholders with artifacts hinting at this TTP
  assetCount: number;       // tenant assets owned by those stakeholders
  ruleCount: number;        // tenant DetectionRules tagged with this TTP-id
  artifactCount: number;    // tenant artifacts hinting at this TTP
  totalNodes: number;       // sum for headline
}

export interface TtpMaterialized {
  facets: TtpFacets;
  graphSnapshot: string | null;
  capped: boolean;
  cap: number;
}

export interface MaterializeOptions {
  actorId?: string | null;            // refine to one IntrusionSet
  stakeholderIds?: string[] | null;   // refine to specific stakeholders
  proceedToGraph: boolean;            // false = facets only, true = include snapshot
  capPerType: number;                 // limit per entity type in graph snapshot
}

// Count facets — single round-trip Cypher. Tenant-scoped on every
// Stakeholder/Asset/DetectionRule/Artifact/Case node touched. Global
// :AttackPattern + :IntrusionSet are read-only shared graph (per
// CLAUDE.md tenant data discipline — global graph stays unscoped).
async function countFacets(
  tenantId: string,
  techniqueId: string,
  opts: MaterializeOptions,
): Promise<TtpFacets> {
  const session = getSession();
  try {
    const res = await session.run(
      `MATCH (ap:AttackPattern {id: $techniqueId})
       // Actors using this TTP (filtered by actorId if specified)
       OPTIONAL MATCH (i:IntrusionSet)-[:USES]->(ap)
         WHERE $actorId IS NULL OR i.id = $actorId
       WITH ap, collect(DISTINCT i.id) AS actorIds
       // Tenant DetectionRules tagged with this T-code (via tags array
       // OR description text match — H1 doesn't yet wire :DETECTS edge)
       OPTIONAL MATCH (r:DetectionRule {tenantId: $tenantId})
         WHERE $techniqueId IN coalesce(r.tags, [])
       WITH ap, actorIds, collect(DISTINCT r.id) AS ruleIds
       // Tenant artifacts hinting at this TTP
       OPTIONAL MATCH (a:Artifact)-[:HINTS_AT_TTP]->(ap)
       OPTIONAL MATCH (c:Case {tenantId: $tenantId})-[:HAS_ARTIFACT]->(a)
       WITH ap, actorIds, ruleIds, collect(DISTINCT a.id) AS artifactIds, collect(DISTINCT c.id) AS caseIds
       // Stakeholders (the case's stakeholder)
       OPTIONAL MATCH (s:Stakeholder {tenantId: $tenantId})<-[:OF_STAKEHOLDER]-(c2:Case)
         WHERE c2.id IN caseIds
           AND ($stakeholderIds IS NULL OR s.id IN $stakeholderIds)
       WITH ap, actorIds, ruleIds, artifactIds, collect(DISTINCT s.id) AS stakeholderIds
       // Assets owned by those stakeholders (cap not applied here — count only)
       OPTIONAL MATCH (s2:Stakeholder)-[:OWNS]->(asset:Asset)
         WHERE s2.id IN stakeholderIds AND s2.tenantId = $tenantId
       RETURN ap.name AS techniqueName,
              size(actorIds) AS actorCount,
              size(stakeholderIds) AS stakeholderCount,
              count(DISTINCT asset) AS assetCount,
              size(ruleIds) AS ruleCount,
              size(artifactIds) AS artifactCount`,
      {
        tenantId,
        techniqueId,
        actorId: opts.actorId ?? null,
        stakeholderIds: opts.stakeholderIds ?? null,
      },
    );
    const rec = res.records[0];
    if (!rec) {
      return {
        techniqueId, techniqueName: null,
        actorCount: 0, stakeholderCount: 0, assetCount: 0,
        ruleCount: 0, artifactCount: 0, totalNodes: 0,
      };
    }
    const facets: TtpFacets = {
      techniqueId,
      techniqueName: (rec.get('techniqueName') as string | null) ?? null,
      actorCount: Number(rec.get('actorCount') ?? 0),
      stakeholderCount: Number(rec.get('stakeholderCount') ?? 0),
      assetCount: Number(rec.get('assetCount') ?? 0),
      ruleCount: Number(rec.get('ruleCount') ?? 0),
      artifactCount: Number(rec.get('artifactCount') ?? 0),
      totalNodes: 0,
    };
    facets.totalNodes = facets.actorCount + facets.stakeholderCount + facets.assetCount + facets.ruleCount + facets.artifactCount + 1;
    return facets;
  } finally {
    await session.close();
  }
}

// Build a graphSnapshot JSON for the canvas. Hard caps per type to
// prevent the silent-data-loss case from Eng review (T1059 → thousands
// of nodes). When `capped: true`, UI must surface the truth.
async function buildGraphSnapshot(
  tenantId: string,
  techniqueId: string,
  opts: MaterializeOptions,
): Promise<{ snapshot: string; capped: boolean }> {
  const session = getSession();
  try {
    const cap = opts.capPerType;
    const res = await session.run(
      `MATCH (ap:AttackPattern {id: $techniqueId})
       OPTIONAL MATCH (i:IntrusionSet)-[:USES]->(ap)
         WHERE $actorId IS NULL OR i.id = $actorId
       WITH ap, collect(DISTINCT i)[0..$cap] AS actors
       OPTIONAL MATCH (r:DetectionRule {tenantId: $tenantId})
         WHERE $techniqueId IN coalesce(r.tags, [])
       WITH ap, actors, collect(DISTINCT r)[0..$cap] AS rules
       OPTIONAL MATCH (a:Artifact)-[:HINTS_AT_TTP]->(ap)
       OPTIONAL MATCH (c:Case {tenantId: $tenantId})-[:HAS_ARTIFACT]->(a)
       WITH ap, actors, rules, collect(DISTINCT a)[0..$cap] AS artifacts, collect(DISTINCT c)[0..$cap] AS cases
       OPTIONAL MATCH (s:Stakeholder {tenantId: $tenantId})<-[:OF_STAKEHOLDER]-(c2:Case)
         WHERE c2 IN cases
           AND ($stakeholderIds IS NULL OR s.id IN $stakeholderIds)
       WITH ap, actors, rules, artifacts, cases, collect(DISTINCT s)[0..$cap] AS stakeholders
       OPTIONAL MATCH (s2:Stakeholder)-[:OWNS]->(asset:Asset)
         WHERE s2 IN stakeholders AND s2.tenantId = $tenantId
       WITH ap, actors, rules, artifacts, cases, stakeholders, collect(DISTINCT asset)[0..$cap] AS assets
       RETURN ap, actors, rules, artifacts, cases, stakeholders, assets`,
      {
        tenantId,
        techniqueId,
        actorId: opts.actorId ?? null,
        stakeholderIds: opts.stakeholderIds ?? null,
        cap,
      },
    );
    const rec = res.records[0];
    const nodes: Array<{ id: string; type: string; entityId: string; label: string; data?: Record<string, unknown> }> = [];
    const edges: Array<{ id: string; source: string; target: string; edgeType: string }> = [];
    if (!rec) {
      return { snapshot: JSON.stringify({ version: 1, nodes, edges }), capped: false };
    }

    function pushNode(type: string, id: string, label: string, data?: Record<string, unknown>): string {
      const nid = `${type}:${id}`;
      if (!nodes.some((n) => n.id === nid)) {
        nodes.push({ id: nid, type, entityId: id, label, data });
      }
      return nid;
    }
    function pushEdge(sourceId: string, targetId: string, edgeType: string): void {
      const eid = `${sourceId}->${targetId}:${edgeType}`;
      if (!edges.some((e) => e.id === eid)) {
        edges.push({ id: eid, source: sourceId, target: targetId, edgeType });
      }
    }

    // Seed
    const ap = rec.get('ap') as { properties: { id: string; name: string } } | null;
    if (!ap) return { snapshot: JSON.stringify({ version: 1, nodes, edges }), capped: false };
    const apNode = pushNode('AttackPattern', ap.properties.id, ap.properties.name ?? ap.properties.id);

    // Actors → AttackPattern
    const actors = (rec.get('actors') as Array<{ properties: { id: string; name: string } }> | null) ?? [];
    for (const a of actors) {
      const id = pushNode('ThreatActor', a.properties.id, a.properties.name ?? a.properties.id);
      pushEdge(id, apNode, 'USES');
    }

    // Rules → AttackPattern (via tags membership; conceptual edge)
    const rules = (rec.get('rules') as Array<{ properties: { id: string; name: string } }> | null) ?? [];
    for (const r of rules) {
      const id = pushNode('DetectionRule', r.properties.id, r.properties.name ?? r.properties.id);
      pushEdge(id, apNode, 'DETECTS');
    }

    // Stakeholders, Assets, Artifacts (cases shown via artifact backref, not added as nodes for clarity)
    const stakeholders = (rec.get('stakeholders') as Array<{ properties: { id: string; name: string } }> | null) ?? [];
    const stakeholderIdToNodeId = new Map<string, string>();
    for (const s of stakeholders) {
      const nid = pushNode('Stakeholder', s.properties.id, s.properties.name ?? s.properties.id);
      stakeholderIdToNodeId.set(s.properties.id, nid);
    }

    const assets = (rec.get('assets') as Array<{ properties: { id: string; name: string } }> | null) ?? [];
    for (const a of assets) {
      pushNode('Asset', a.properties.id, a.properties.name ?? a.properties.id);
      // Edge from Stakeholder -> Asset is implicit; could add via 2nd query later.
    }

    const artifacts = (rec.get('artifacts') as Array<{ properties: { id: string; type: string } }> | null) ?? [];
    for (const a of artifacts) {
      const id = pushNode('Artifact', a.properties.id, `${a.properties.type ?? 'IOC'}:${a.properties.id.slice(0, 8)}`);
      pushEdge(id, apNode, 'HINTS_AT_TTP');
    }

    // Heuristic capped flag: if any per-type collected exactly `cap`, we may have truncated.
    const capped =
      actors.length === cap || rules.length === cap || artifacts.length === cap || stakeholders.length === cap || assets.length === cap;

    return { snapshot: JSON.stringify({ version: 1, nodes, edges }), capped };
  } finally {
    await session.close();
  }
}

export async function materializeTtpHunt(
  tenantId: string,
  techniqueId: string,
  opts: MaterializeOptions,
): Promise<TtpMaterialized> {
  const facets = await countFacets(tenantId, techniqueId, opts);
  if (!opts.proceedToGraph) {
    return { facets, graphSnapshot: null, capped: false, cap: opts.capPerType };
  }
  const { snapshot, capped } = await buildGraphSnapshot(tenantId, techniqueId, opts);
  return { facets, graphSnapshot: snapshot, capped, cap: opts.capPerType };
}
