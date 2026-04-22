import { getSession } from '../db/neo4j.js';

export interface CweDetail {
  id: string;
  name: string | null;
}

export interface CweRelatedCve {
  cveId: string;
  description: string | null;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
}

export async function getCwe(id: string): Promise<CweDetail | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (w:CWE {id: $id}) RETURN w.id AS id, w.name AS name`,
      { id },
    );
    const record = result.records[0];
    if (!record) return null;
    return {
      id: record.get('id') as string,
      name: (record.get('name') as string | null) ?? null,
    };
  } finally {
    await session.close();
  }
}

export async function listCvesWithCwe(
  cweId: string,
  page: number,
  perPage: number,
): Promise<CweRelatedCve[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (w:CWE {id: $id})<-[:WEAKNESS]-(cve:CVE)
       RETURN cve.id AS cveId, cve.description AS description,
              cve.cvssV31BaseSeverity AS severity, cve.cvssV31BaseScore AS score,
              toString(cve.publishedAt) AS publishedAt
       ORDER BY coalesce(cve.cvssV31BaseScore, 0) DESC, cve.id DESC
       SKIP $skip LIMIT $limit`,
      {
        id: cweId,
        skip: BigInt(Math.max(0, (page - 1) * perPage)),
        limit: BigInt(perPage),
      },
    );
    return result.records.map((record) => ({
      cveId: record.get('cveId') as string,
      description: (record.get('description') as string | null) ?? null,
      severity: (record.get('severity') as string | null) ?? null,
      baseScore: (record.get('score') as number | null) ?? null,
      publishedAt: (record.get('publishedAt') as string | null) ?? null,
    }));
  } finally {
    await session.close();
  }
}

export async function countCvesWithCwe(cweId: string): Promise<number> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (:CWE {id: $id})<-[:WEAKNESS]-(cve:CVE)
       RETURN count(cve) AS n`,
      { id: cweId },
    );
    return Number(result.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}
