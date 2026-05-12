import { getSession } from '../db/neo4j.js';

export interface AttackPatternDetail {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  platforms: string[];
  detection: string | null;
  dataSources: string[];
  detections: DataComponentRef[];
  killChainPhases: string[];
  isSubtechnique: boolean;
}

export interface ThreatActorRef {
  id: string;
  name: string;
  techniqueCount: number;
}

export interface DataComponentRef {
  id: string;
  name: string;
  description: string | null;
  dataSourceName: string;
}

function rowToAttackPattern(rec: { get: (key: string) => unknown }): AttackPatternDetail {
  return {
    id: rec.get('id') as string,
    name: rec.get('name') as string,
    description: (rec.get('description') as string | null) ?? null,
    url: (rec.get('url') as string | null) ?? null,
    platforms: (rec.get('platforms') as string[]) ?? [],
    detection: (rec.get('detection') as string | null) ?? null,
    dataSources: (rec.get('dataSources') as string[]) ?? [],
    detections: [],
    killChainPhases: (rec.get('killChainPhases') as string[]) ?? [],
    isSubtechnique: Boolean(rec.get('isSubtechnique')),
  };
}

function rowToThreatActor(rec: { get: (key: string) => unknown }): ThreatActorRef {
  return {
    id: rec.get('id') as string,
    name: rec.get('name') as string,
    techniqueCount: Number(rec.get('techniqueCount') ?? 0),
  };
}

function rowToDataComponent(rec: { get: (key: string) => unknown }): DataComponentRef {
  return {
    id: rec.get('id') as string,
    name: rec.get('name') as string,
    description: (rec.get('description') as string | null) ?? null,
    dataSourceName: rec.get('dataSourceName') as string,
  };
}

export async function getAttackPattern(id: string): Promise<AttackPatternDetail | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (a:AttackPattern {id: $id})
       RETURN a.id AS id, a.name AS name, a.description AS description, a.url AS url,
               coalesce(a.platforms, []) AS platforms,
               a.detection AS detection,
               coalesce(a.dataSources, []) AS dataSources,
               coalesce(a.killChainPhases, []) AS killChainPhases,
               coalesce(a.isSubtechnique, false) AS isSubtechnique`,
      { id },
    );
    const record = result.records[0];
    if (!record) return null;
    const attackPattern = rowToAttackPattern(record);
    attackPattern.detections = await listDetectionsForTechnique(id);
    return attackPattern;
  } finally {
    await session.close();
  }
}

export async function listDetectionsForTechnique(attackPatternId: string): Promise<DataComponentRef[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (ap:AttackPattern {id: $id})<-[:DETECTS]-(s:DetectionStrategy)
       OPTIONAL MATCH (s)-[:USES_ANALYTIC]->(dc:DataComponent)-[:OF_DATA_SOURCE]->(ds:DataSource)
       RETURN dc.id AS id,
              coalesce(dc.name, s.name) AS name,
              coalesce(dc.description, s.description) AS description,
              coalesce(ds.name, 'unknown source') AS dataSourceName
       ORDER BY dataSourceName, name`,
      { id: attackPatternId },
    );
    return result.records.map(rowToDataComponent);
  } finally {
    await session.close();
  }
}

export async function listThreatActorsUsingTechnique(
  attackPatternId: string,
  limit: number,
): Promise<ThreatActorRef[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (i:IntrusionSet)-[:USES]->(:AttackPattern {id: $id})
       RETURN i.id AS id, i.name AS name,
              size([(i)-[:USES]->(t:AttackPattern) | t]) AS techniqueCount
       ORDER BY techniqueCount DESC, i.name
       LIMIT $limit`,
      { id: attackPatternId, limit: BigInt(limit) },
    );
    return result.records.map(rowToThreatActor);
  } finally {
    await session.close();
  }
}

export interface AttackPatternSearchHit {
  id: string;
  name: string;
  isSubtechnique: boolean;
  parentTechniqueId: string | null;
}

// Fuzzy autocomplete search. Two match strategies, OR-ed:
//   1. T-code prefix (case-insensitive, anchored): query 'T1059' →
//      matches T1059, T1059.001, T1059.002, ... cheap and intentional.
//   2. Name CONTAINS (case-insensitive): query 'powershell' →
//      matches T1059.001 PowerShell.
// Sort by id ASC so parent (T1059) lands before its sub-techniques
// (T1059.001 ...) in the dropdown — natural reading order.
export async function searchAttackPatterns(
  q: string,
  limit: number,
): Promise<AttackPatternSearchHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:AttackPattern)
       WHERE toLower(a.id) STARTS WITH toLower($q)
          OR toLower(a.name) CONTAINS toLower($q)
       RETURN a.id AS id, a.name AS name,
              coalesce(a.isSubtechnique, false) AS isSubtechnique
       ORDER BY a.id ASC
       LIMIT toInteger($limit)`,
      { q: trimmed, limit: Math.max(1, Math.min(limit, 25)) },
    );
    return r.records.map((rec) => {
      const id = rec.get('id') as string;
      const isSub = Boolean(rec.get('isSubtechnique'));
      return {
        id,
        name: rec.get('name') as string,
        isSubtechnique: isSub,
        parentTechniqueId: isSub ? id.split('.')[0] ?? null : null,
      };
    });
  } finally {
    await session.close();
  }
}
