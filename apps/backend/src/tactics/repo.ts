import { getSession } from '../db/neo4j.js';

export interface TacticDetail {
  id: string;
  name: string;
  shortname: string;
  description: string | null;
  url: string | null;
  ordering: number;
  techniqueCount: number;
}

export interface MatrixTechniqueRow {
  id: string;
  name: string;
  isSubtechnique: boolean;
  parentTechniqueId: string | null;
}

export interface MatrixColumn {
  tactic: TacticDetail;
  techniques: MatrixTechniqueRow[];
}

function rowToTactic(rec: { get: (key: string) => unknown }): TacticDetail {
  return {
    id: rec.get('id') as string,
    name: rec.get('name') as string,
    shortname: rec.get('shortname') as string,
    description: (rec.get('description') as string | null) ?? null,
    url: (rec.get('url') as string | null) ?? null,
    ordering: Number(rec.get('ordering') ?? 0),
    techniqueCount: Number(rec.get('techniqueCount') ?? 0),
  };
}

export async function listTactics(): Promise<TacticDetail[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (t:Tactic)
       OPTIONAL MATCH (t)<-[:OF_TACTIC]-(a:AttackPattern)
       RETURN t.id AS id, t.name AS name, t.shortname AS shortname,
              t.description AS description, t.url AS url, t.ordering AS ordering,
              count(a) AS techniqueCount
       ORDER BY t.ordering`,
    );
    return result.records.map(rowToTactic);
  } finally {
    await session.close();
  }
}

export async function getMatrix(filter: {
  platform?: string | null;
  search?: string | null;
}): Promise<MatrixColumn[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (t:Tactic)
       OPTIONAL MATCH (t)<-[:OF_TACTIC]-(a:AttackPattern)
       WHERE ($platform IS NULL OR $platform IN coalesce(a.platforms, []))
         AND ($search IS NULL OR toLower(a.name) CONTAINS toLower($search) OR toLower(a.id) CONTAINS toLower($search))
       WITH t, a
       ORDER BY a.id
       WITH t, collect({id: a.id, name: a.name, isSubtechnique: coalesce(a.isSubtechnique, false), parentTechniqueId: null}) AS techniques
       RETURN t.id AS tacticId, t.name AS tacticName, t.shortname AS tacticShortname,
              t.description AS tacticDescription, t.url AS tacticUrl, t.ordering AS tacticOrdering,
              size(techniques) AS techniqueCount,
              [tech IN techniques WHERE tech.id IS NOT NULL] AS techniques
       ORDER BY t.ordering`,
      {
        platform: filter.platform ?? null,
        search: filter.search ?? null,
      },
    );

    return result.records.map((rec) => ({
      tactic: {
        id: rec.get('tacticId') as string,
        name: rec.get('tacticName') as string,
        shortname: rec.get('tacticShortname') as string,
        description: (rec.get('tacticDescription') as string | null) ?? null,
        url: (rec.get('tacticUrl') as string | null) ?? null,
        ordering: Number(rec.get('tacticOrdering') ?? 0),
        techniqueCount: Number(rec.get('techniqueCount') ?? 0),
      },
      techniques: ((rec.get('techniques') as MatrixTechniqueRow[] | null) ?? []).map((tech) => ({
        id: tech.id,
        name: tech.name,
        isSubtechnique: tech.isSubtechnique,
        parentTechniqueId: tech.parentTechniqueId,
      })),
    }));
  } finally {
    await session.close();
  }
}
