import { getSession } from '../db/neo4j.js';
import { newId } from '../utils/uuid.js';
import { GraphQLError } from 'graphql';
import type {
  HuntActorRef,
  HuntAssetRef,
  HuntCveRow,
  HuntRecord,
  HuntStatus,
  HuntTtpRow,
  ReleaseTier,
} from './types.js';
import { logAudit } from '../audits/log.js';

const HUNT_RETURN = `
  h.id AS id, h.tenantId AS tenantId, h.name AS name, h.status AS status,
  coalesce(h.kind, 'STRUCTURED') AS kind,
  coalesce(h.releaseTier, 'internal') AS releaseTier,
  toString(h.createdAt) AS createdAt, toString(h.updatedAt) AS updatedAt,
  head([(u:User)-[:CREATED]->(h) | u.id]) AS createdByUserId,
  size([(h)-[:TARGETS]->(:IntrusionSet) | 1]) AS targetActorCount,
  size([(h)-[:SCOPED_TO]->(:Asset) | 1]) AS scopedAssetCount,
  h.graphSnapshot AS graphSnapshot,
  h.graphSeedType AS graphSeedType,
  h.graphSeedId AS graphSeedId,
  h.redactionProfileId AS redactionProfileId
`;

function rowToHunt(rec: { get: (k: string) => unknown }): HuntRecord {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    name: rec.get('name') as string,
    kind: (rec.get('kind') as HuntRecord['kind']) ?? 'STRUCTURED',
    status: rec.get('status') as HuntStatus,
    // Encode dash → underscore at the boundary: storage uses 'cross-agency'
    // but GraphQL ReleaseTier enum forbids hyphens (uses 'cross_agency').
    // Fixing here covers every Hunt query path (hunt, hunts, useHuntGraph)
    // in one place — symmetric with the same fix on listStixExportsForHunt.
    releaseTier: ((rec.get('releaseTier') as string) ?? 'internal').replace(/-/g, '_') as ReleaseTier,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
    createdByUserId: (rec.get('createdByUserId') as string | null) ?? null,
    targetActorCount: Number(rec.get('targetActorCount') ?? 0),
    scopedAssetCount: Number(rec.get('scopedAssetCount') ?? 0),
    graphSnapshot: (rec.get('graphSnapshot') as string | null) ?? null,
    graphSeedType: (rec.get('graphSeedType') as string | null) ?? null,
    graphSeedId: (rec.get('graphSeedId') as string | null) ?? null,
    redactionProfileId: (rec.get('redactionProfileId') as string | null) ?? null,
  };
}

// F1b — Set release tier on a Hunt. Mirror of setRuleReleaseTier.
// Audit chain via :ReleaseTierChange (same node label, distinguished
// by huntId vs ruleId field). No-op on same-tier.
export async function setHuntReleaseTier(
  tenantId: string,
  userId: string,
  huntId: string,
  tier: ReleaseTier,
): Promise<HuntRecord> {
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx) => {
      const current = await tx.run(
        `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
         RETURN coalesce(h.releaseTier, 'internal') AS tier`,
        { huntId, tenantId },
      );
      const before = current.records[0]?.get('tier') as ReleaseTier | undefined;
      if (!before) {
        throw new GraphQLError('hunt not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (before === tier) {
        const r = await tx.run(
          `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId}) RETURN ${HUNT_RETURN}`,
          { huntId, tenantId },
        );
        return { row: rowToHunt(r.records[0]!), changed: false, before };
      }
      const upd = await tx.run(
        `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
         SET h.releaseTier = $tier, h.updatedAt = datetime()
         CREATE (c:ReleaseTierChange {
           id: randomUUID(), tenantId: $tenantId,
           huntId: $huntId, fromTier: $before, toTier: $tier,
           changedByUserId: $userId, ts: datetime()
         })
         RETURN ${HUNT_RETURN}`,
        { huntId, tenantId, tier, before, userId },
      );
      return { row: rowToHunt(upd.records[0]!), changed: true, before };
    });
    if (result.changed) {
      await logAudit(
        tenantId, userId, 'hunt.release_tier_change',
        { type: 'Hunt', id: huntId },
        { releaseTier: result.before },
        { releaseTier: tier },
      );
    }
    return result.row;
  } finally {
    await session.close();
  }
}

export interface CreateHuntInput {
  tenantId: string;
  userId: string;
  name: string;
  targetActorIds: string[];
  scopedAssetIds: string[];
}

export async function createHunt(input: CreateHuntInput): Promise<HuntRecord> {
  const id = newId();
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (u:User {id: $userId})
         CREATE (h:Hunt {
           id: $id, tenantId: $tenantId, name: $name, status: 'ACTIVE',
           createdAt: datetime(), updatedAt: datetime()
         })
         CREATE (u)-[:CREATED]->(h)`,
        { id, tenantId: input.tenantId, userId: input.userId, name: input.name },
      );

      if (input.targetActorIds.length) {
        await tx.run(
          `MATCH (h:Hunt {id: $id, tenantId: $tenantId})
           UNWIND $taIds AS taId
           MATCH (ta:IntrusionSet {id: taId})
           CREATE (h)-[:TARGETS]->(ta)`,
          { id, tenantId: input.tenantId, taIds: input.targetActorIds },
        );
      }

      if (input.scopedAssetIds.length) {
        await tx.run(
          `MATCH (h:Hunt {id: $id, tenantId: $tenantId})
           UNWIND $aIds AS aId
           MATCH (a:Asset {id: aId, tenantId: $tenantId})
           CREATE (h)-[:SCOPED_TO]->(a)`,
          { id, tenantId: input.tenantId, aIds: input.scopedAssetIds },
        );
      }

      const r = await tx.run(
        `MATCH (h:Hunt {id: $id, tenantId: $tenantId}) RETURN ${HUNT_RETURN}`,
        { id, tenantId: input.tenantId },
      );
      return rowToHunt(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export async function findHuntById(tenantId: string, id: string): Promise<HuntRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {id: $id, tenantId: $tenantId}) RETURN ${HUNT_RETURN}`,
      { tenantId, id },
    );
    const rec = r.records[0];
    return rec ? rowToHunt(rec) : null;
  } finally {
    await session.close();
  }
}

export async function listHunts(tenantId: string, page: number, perPage: number): Promise<HuntRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {tenantId: $tenantId})
       RETURN ${HUNT_RETURN}
       ORDER BY h.createdAt DESC
       SKIP $skip LIMIT $limit`,
      {
        tenantId,
        skip: BigInt(Math.max(0, (page - 1) * perPage)),
        limit: BigInt(perPage),
      },
    );
    return r.records.map(rowToHunt);
  } finally {
    await session.close();
  }
}

export async function countHunts(tenantId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {tenantId: $tenantId}) RETURN count(h) AS n`,
      { tenantId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function deleteHunt(tenantId: string, id: string): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {id: $id, tenantId: $tenantId})
       DETACH DELETE h
       RETURN count(h) AS deleted`,
      { tenantId, id },
    );
    return Number(r.records[0]?.get('deleted') ?? 0) > 0;
  } finally {
    await session.close();
  }
}

export async function listTargetActors(tenantId: string, huntId: string): Promise<HuntActorRef[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Hunt {id: $huntId, tenantId: $tenantId})-[:TARGETS]->(ta:IntrusionSet)
       RETURN ta.id AS id, ta.name AS name,
              size([(ta)-[:USES]->(t:AttackPattern) | t]) AS techniqueCount
       ORDER BY ta.name`,
      { tenantId, huntId },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      name: rec.get('name') as string,
      techniqueCount: Number(rec.get('techniqueCount') ?? 0),
    }));
  } finally {
    await session.close();
  }
}

export async function listScopedAssets(tenantId: string, huntId: string): Promise<HuntAssetRef[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Hunt {id: $huntId, tenantId: $tenantId})-[:SCOPED_TO]->(a:Asset)
       RETURN a.id AS id, a.name AS name, a.kind AS kind
       ORDER BY a.name`,
      { tenantId, huntId },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      name: rec.get('name') as string,
      kind: rec.get('kind') as string,
    }));
  } finally {
    await session.close();
  }
}

export async function countTtps(tenantId: string, huntId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Hunt {id: $huntId, tenantId: $tenantId})-[:TARGETS]->(:IntrusionSet)
              -[:USES]->(ap:AttackPattern)
       RETURN count(DISTINCT ap) AS n`,
      { tenantId, huntId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function listTopTtps(tenantId: string, huntId: string, limit: number): Promise<HuntTtpRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Hunt {id: $huntId, tenantId: $tenantId})-[:TARGETS]->(ta:IntrusionSet)
              -[:USES]->(ap:AttackPattern)
       WITH ap, count(DISTINCT ta) AS actorCount
       RETURN ap.id AS id, ap.name AS name,
              coalesce(ap.killChainPhases, []) AS killChainPhases,
              actorCount
       ORDER BY actorCount DESC, ap.id
       LIMIT $limit`,
      { tenantId, huntId, limit: BigInt(limit) },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      name: rec.get('name') as string,
      killChainPhases: (rec.get('killChainPhases') as string[]) ?? [],
      actorCount: Number(rec.get('actorCount') ?? 0),
    }));
  } finally {
    await session.close();
  }
}

export async function countCves(tenantId: string, huntId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Hunt {id: $huntId, tenantId: $tenantId})-[:SCOPED_TO]->(a:Asset)
              -[:HAS_COMPONENT]->(:SoftwareComponent)
              -[:OF_PRODUCT]->(:Product)-[:HAS_CPE]->(:CPE)<-[:AFFECTS]-(cve:CVE)
       RETURN count(DISTINCT cve) AS n`,
      { tenantId, huntId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function listTopCves(tenantId: string, huntId: string, limit: number): Promise<HuntCveRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Hunt {id: $huntId, tenantId: $tenantId})-[:SCOPED_TO]->(a:Asset)
              -[:HAS_COMPONENT]->(:SoftwareComponent)
              -[:OF_PRODUCT]->(:Product)-[:HAS_CPE]->(:CPE)<-[:AFFECTS]-(cve:CVE)
       WITH cve, count(DISTINCT a) AS affectedAssetCount
       RETURN cve.id AS cveId, cve.description AS description,
              cve.cvssV31BaseSeverity AS severity, cve.cvssV31BaseScore AS score,
              affectedAssetCount
       ORDER BY coalesce(cve.cvssV31BaseScore, 0) DESC, cve.id DESC
       LIMIT $limit`,
      { tenantId, huntId, limit: BigInt(limit) },
    );
    return r.records.map((rec) => ({
      cveId: rec.get('cveId') as string,
      description: (rec.get('description') as string | null) ?? null,
      severity: (rec.get('severity') as string | null) ?? null,
      baseScore: (rec.get('score') as number | null) ?? null,
      affectedAssetCount: Number(rec.get('affectedAssetCount') ?? 0),
    }));
  } finally {
    await session.close();
  }
}

// ─── G2: Graph-kind hunt + cross-entity search ──────────────────────

export interface SaveGraphHuntInput {
  tenantId: string;
  userId: string;
  name: string;
  snapshot: string;
  seedType: string | null;
  seedId: string | null;
}

export async function saveGraphAsHunt(input: SaveGraphHuntInput): Promise<HuntRecord> {
  const id = newId();
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      const r = await tx.run(
        `MATCH (u:User {id: $userId})
         CREATE (h:Hunt {
           id: $id, tenantId: $tenantId, name: $name,
           kind: 'GRAPH', status: 'ACTIVE',
           graphSnapshot: $snapshot,
           graphSeedType: $seedType, graphSeedId: $seedId,
           createdAt: datetime(), updatedAt: datetime()
         })
         CREATE (u)-[:CREATED]->(h)
         RETURN ${HUNT_RETURN}`,
        { id, ...input },
      );
      return rowToHunt(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export async function updateHuntSnapshot(
  tenantId: string,
  id: string,
  snapshot: string,
): Promise<HuntRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {id: $id, tenantId: $tenantId})
       WHERE coalesce(h.kind, 'STRUCTURED') = 'GRAPH'
       SET h.graphSnapshot = $snapshot, h.updatedAt = datetime()
       RETURN ${HUNT_RETURN}`,
      { id, tenantId, snapshot },
    );
    const rec = r.records[0];
    return rec ? rowToHunt(rec) : null;
  } finally {
    await session.close();
  }
}

// H-meta — Update Hunt name (typo fixes, ops rebrands). Snapshot path is
// `updateHuntSnapshot` — kept separate because that's auto-saved on every
// canvas mutation; this is operator-explicit. Both kinds (STRUCTURED + GRAPH).
export async function updateHuntName(
  tenantId: string,
  id: string,
  name: string,
): Promise<HuntRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {id: $id, tenantId: $tenantId})
       SET h.name = $name, h.updatedAt = datetime()
       RETURN ${HUNT_RETURN}`,
      { id, tenantId, name },
    );
    const rec = r.records[0];
    return rec ? rowToHunt(rec) : null;
  } finally {
    await session.close();
  }
}

// Cross-entity search for graph search-add. Tenant-scoped; case-insensitive
// substring match on name/slug/cveId across 4 entity types. Limit per type
// to avoid one type swamping the result set.
//
// Each type query uses its own session. Neo4j Session is single-statement —
// running 4 parallel session.run() on one session throws "open transaction".
export async function searchEntities(
  tenantId: string,
  q: string,
  perTypeLimit: number,
): Promise<Array<{ type: string; id: string; label: string; detail: string | null }>> {
  if (!q.trim()) return [];
  const needle = q.toLowerCase().trim();
  const limit = BigInt(perTypeLimit);

  async function runOne<T>(query: string, params: Record<string, unknown>, mapFn: (rec: { get: (k: string) => unknown }) => T): Promise<T[]> {
    const s = getSession();
    try {
      const r = await s.run(query, params);
      return r.records.map(mapFn);
    } finally {
      await s.close();
    }
  }

  try {
    const [stake, asset, cve, kase] = await Promise.all([
      runOne(
        `MATCH (s:Stakeholder {tenantId: $tenantId})
         WHERE toLower(s.name) CONTAINS $q OR toLower(s.slug) CONTAINS $q
         RETURN s.id AS id, s.name AS label, s.slug AS detail
         LIMIT $limit`,
        { tenantId, q: needle, limit },
        (rec) => ({ id: rec.get('id') as string, label: rec.get('label') as string, detail: (rec.get('detail') as string | null) ?? null }),
      ),
      runOne(
        `MATCH (a:Asset {tenantId: $tenantId})
         WHERE toLower(a.name) CONTAINS $q OR toLower(coalesce(a.hostname, '')) CONTAINS $q
         RETURN a.id AS id, a.name AS label, a.hostname AS detail
         LIMIT $limit`,
        { tenantId, q: needle, limit },
        (rec) => ({ id: rec.get('id') as string, label: rec.get('label') as string, detail: (rec.get('detail') as string | null) ?? null }),
      ),
      runOne(
        `MATCH (cve:CVE)
         WHERE toUpper(cve.id) CONTAINS toUpper($q)
         RETURN cve.id AS id, cve.id AS label, cve.cvssV31BaseSeverity AS detail
         LIMIT $limit`,
        { q: needle, limit },
        (rec) => ({ id: rec.get('id') as string, label: rec.get('label') as string, detail: (rec.get('detail') as string | null) ?? null }),
      ),
      runOne(
        `MATCH (c:Case {tenantId: $tenantId})
         WHERE toLower(c.reportNo) CONTAINS $q OR toLower(coalesce(c.title, '')) CONTAINS $q
         RETURN c.id AS id, c.reportNo AS label, c.title AS detail
         LIMIT $limit`,
        { tenantId, q: needle, limit },
        (rec) => ({ id: rec.get('id') as string, label: rec.get('label') as string, detail: (rec.get('detail') as string | null) ?? null }),
      ),
    ]);
    return [
      ...stake.map((r) => ({ type: 'Stakeholder', ...r })),
      ...asset.map((r) => ({ type: 'Asset', ...r })),
      ...cve.map((r) => ({ type: 'CVE', ...r })),
      ...kase.map((r) => ({ type: 'Case', ...r })),
    ];
  } catch (err) {
    throw err;
  }
}
