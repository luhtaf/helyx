import { getSession } from '../db/neo4j.js';
import { newId } from '../utils/uuid.js';
import type {
  HuntActorRef,
  HuntAssetRef,
  HuntCveRow,
  HuntRecord,
  HuntStatus,
  HuntTtpRow,
} from './types.js';

const HUNT_RETURN = `
  h.id AS id, h.tenantId AS tenantId, h.name AS name, h.status AS status,
  toString(h.createdAt) AS createdAt, toString(h.updatedAt) AS updatedAt,
  head([(u:User)-[:CREATED]->(h) | u.id]) AS createdByUserId,
  size([(h)-[:TARGETS]->(:IntrusionSet) | 1]) AS targetActorCount,
  size([(h)-[:SCOPED_TO]->(:Asset) | 1]) AS scopedAssetCount
`;

function rowToHunt(rec: { get: (k: string) => unknown }): HuntRecord {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    name: rec.get('name') as string,
    status: rec.get('status') as HuntStatus,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
    createdByUserId: (rec.get('createdByUserId') as string | null) ?? null,
    targetActorCount: Number(rec.get('targetActorCount') ?? 0),
    scopedAssetCount: Number(rec.get('scopedAssetCount') ?? 0),
  };
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
