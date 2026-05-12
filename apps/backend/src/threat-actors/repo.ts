import { getSession } from '../db/neo4j.js';

export interface ThreatActorRow {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  url: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  techniqueCount: number;
}

export interface AttackPatternRow {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  platforms: string[];
  killChainPhases: string[];
  isSubtechnique: boolean;
}

const TA_RETURN = `
  i.id AS id, i.name AS name, i.description AS description,
  coalesce(i.aliases, []) AS aliases, i.url AS url,
  toString(i.createdAt) AS createdAt, toString(i.modifiedAt) AS modifiedAt,
  size([(i)-[:USES]->(a:AttackPattern) | a]) AS techniqueCount
`;

function rowToTa(rec: { get: (k: string) => unknown }): ThreatActorRow {
  return {
    id: rec.get('id') as string,
    name: rec.get('name') as string,
    description: (rec.get('description') as string | null) ?? null,
    aliases: (rec.get('aliases') as string[]) ?? [],
    url: (rec.get('url') as string | null) ?? null,
    createdAt: (rec.get('createdAt') as string | null) ?? null,
    modifiedAt: (rec.get('modifiedAt') as string | null) ?? null,
    techniqueCount: Number(rec.get('techniqueCount') ?? 0),
  };
}

export async function listThreatActors(
  filters: { search?: string | null; page: number; perPage: number },
): Promise<ThreatActorRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (i:IntrusionSet)
       WHERE ($search IS NULL
              OR toLower(i.name) CONTAINS toLower($search)
              OR toLower(i.id) CONTAINS toLower($search))
       RETURN ${TA_RETURN}
       ORDER BY i.name
       SKIP $skip LIMIT $limit`,
      {
        search: filters.search ?? null,
        skip: BigInt(Math.max(0, (filters.page - 1) * filters.perPage)),
        limit: BigInt(filters.perPage),
      },
    );
    return r.records.map(rowToTa);
  } finally {
    await session.close();
  }
}

export async function countThreatActors(filters: { search?: string | null }): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (i:IntrusionSet)
       WHERE ($search IS NULL
              OR toLower(i.name) CONTAINS toLower($search)
              OR toLower(i.id) CONTAINS toLower($search))
       RETURN count(i) AS n`,
      { search: filters.search ?? null },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function findThreatActorById(id: string): Promise<ThreatActorRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (i:IntrusionSet {id: $id}) RETURN ${TA_RETURN}`,
      { id },
    );
    const rec = r.records[0];
    return rec ? rowToTa(rec) : null;
  } finally {
    await session.close();
  }
}

// C — Guess threat actor by TTP overlap. Returns ranked actors using
// Jaccard index over the USES edge set. Single Cypher pass: iterate the
// input technique set, walk USES backwards to actors, then for each
// candidate count its full TTP set for the union denominator.
//
// Why Jaccard over raw matched count: penalises mass-actor noise. An
// actor that uses 200 TTPs (kitchen-sink IntrusionSets like Lazarus)
// would always win on raw count even with thin overlap. Jaccard is
// symmetric — favours actors whose USES set most resembles the input.
export interface ActorMatchRow {
  actor: ThreatActorRow;
  matchedCount: number;
  actorTtpCount: number;
  score: number;
  matchedTechniqueIds: string[];
}

export async function guessActorByTtps(
  techniqueIds: string[],
  limit: number,
): Promise<ActorMatchRow[]> {
  if (techniqueIds.length === 0) return [];
  const session = getSession();
  try {
    const r = await session.run(
      `WITH $techniqueIds AS inputIds, size($techniqueIds) AS inputCount
       UNWIND inputIds AS tid
       MATCH (a:AttackPattern {id: tid})<-[:USES]-(i:IntrusionSet)
       WITH i, inputIds, inputCount, collect(DISTINCT tid) AS matchedIds
       WITH i, matchedIds, size(matchedIds) AS matchedCount,
            inputCount,
            size([(i)-[:USES]->(:AttackPattern) | 1]) AS actorTtpCount
       WITH i, matchedIds, matchedCount, actorTtpCount,
            (inputCount + actorTtpCount - matchedCount) AS unionCount
       WITH i, matchedIds, matchedCount, actorTtpCount,
            CASE WHEN unionCount = 0 THEN 0.0
                 ELSE toFloat(matchedCount) / toFloat(unionCount) END AS score
       RETURN ${TA_RETURN}, matchedCount, actorTtpCount, score, matchedIds AS matchedTechniqueIds
       ORDER BY matchedCount DESC, score DESC, i.name ASC
       LIMIT toInteger($limit)`,
      { techniqueIds, limit: Math.max(1, Math.min(limit, 50)) },
    );
    return r.records.map((rec) => ({
      actor: rowToTa(rec),
      matchedCount: Number((rec.get('matchedCount') as { toString: () => string }).toString()),
      actorTtpCount: Number((rec.get('actorTtpCount') as { toString: () => string }).toString()),
      score: rec.get('score') as number,
      matchedTechniqueIds: rec.get('matchedTechniqueIds') as string[],
    }));
  } finally {
    await session.close();
  }
}

export async function listTechniquesUsedBy(intrusionSetId: string): Promise<AttackPatternRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:IntrusionSet {id: $id})-[:USES]->(a:AttackPattern)
       RETURN a.id AS id, a.name AS name, a.description AS description, a.url AS url,
              coalesce(a.platforms, []) AS platforms,
              coalesce(a.killChainPhases, []) AS killChainPhases,
              coalesce(a.isSubtechnique, false) AS isSubtechnique
       ORDER BY a.id`,
      { id: intrusionSetId },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      name: rec.get('name') as string,
      description: (rec.get('description') as string | null) ?? null,
      url: (rec.get('url') as string | null) ?? null,
      platforms: (rec.get('platforms') as string[]) ?? [],
      killChainPhases: (rec.get('killChainPhases') as string[]) ?? [],
      isSubtechnique: Boolean(rec.get('isSubtechnique')),
    }));
  } finally {
    await session.close();
  }
}
