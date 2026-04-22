import { getSession } from '../db/neo4j.js';
import type { CveMatchRecord, MatchMode } from './types.js';

export async function listAssetCves(
  tenantId: string,
  assetId: string,
  mode: MatchMode,
  limit: number,
): Promise<CveMatchRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(LIST_CYPHER[mode], { tenantId, assetId, limit: BigInt(limit) });
    return r.records.map((rec) => ({
      cveId: rec.get('cveId') as string,
      description: (rec.get('description') as string | null) ?? null,
      cvssV31BaseScore: (rec.get('score') as number | null) ?? null,
      cvssV31BaseSeverity: (rec.get('severity') as string | null) ?? null,
      publishedAt: (rec.get('publishedAt') as string | null) ?? null,
      componentPurl: rec.get('componentPurl') as string,
      cpeUri: rec.get('cpeUri') as string,
      mode,
    }));
  } finally {
    await session.close();
  }
}

export async function countAssetCves(
  tenantId: string,
  assetId: string,
  mode: MatchMode,
): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(COUNT_CYPHER[mode], { tenantId, assetId });
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

const ASSET_BASE = `
  MATCH (a:Asset {id: $assetId, tenantId: $tenantId})-[:HAS_COMPONENT]->(c:SoftwareComponent)
        -[:OF_PRODUCT]->(p:Product)-[:HAS_CPE]->(cpe:CPE)<-[:AFFECTS]-(cve:CVE)
`;

const RETURN_AND_ORDER = `
  WITH cve, head(collect(DISTINCT c.purl)) AS componentPurl, head(collect(DISTINCT cpe.uri)) AS cpeUri
  RETURN cve.id AS cveId,
         cve.description AS description,
         cve.cvssV31BaseScore AS score,
         cve.cvssV31BaseSeverity AS severity,
         toString(cve.publishedAt) AS publishedAt,
         componentPurl,
         cpeUri
  ORDER BY coalesce(cve.cvssV31BaseScore, 0) DESC, cve.id DESC
  LIMIT $limit
`;

const LIST_CYPHER: Record<MatchMode, string> = {
  EXACT: `
    ${ASSET_BASE}
    WHERE c.version IS NOT NULL AND cpe.version = c.version
    ${RETURN_AND_ORDER}
  `,
  MAJOR_MINOR: `
    ${ASSET_BASE}
    WHERE c.version IS NOT NULL
    WITH cve, c, cpe, split(c.version, '.') AS vp
    WHERE size(vp) >= 2
      AND (cpe.version STARTS WITH (vp[0] + '.' + vp[1] + '.')
           OR cpe.version = (vp[0] + '.' + vp[1]))
    ${RETURN_AND_ORDER}
  `,
  MAJOR: `
    ${ASSET_BASE}
    WHERE c.version IS NOT NULL
    WITH cve, c, cpe, split(c.version, '.') AS vp
    WHERE size(vp) >= 1
      AND (cpe.version STARTS WITH (vp[0] + '.')
           OR cpe.version = vp[0])
    ${RETURN_AND_ORDER}
  `,
  BEAST: `${ASSET_BASE} ${RETURN_AND_ORDER}`,
};

const COUNT_CYPHER: Record<MatchMode, string> = {
  EXACT: `${ASSET_BASE} WHERE c.version IS NOT NULL AND cpe.version = c.version RETURN count(DISTINCT cve) AS n`,
  MAJOR_MINOR: `
    ${ASSET_BASE}
    WHERE c.version IS NOT NULL
    WITH cve, c, cpe, split(c.version, '.') AS vp
    WHERE size(vp) >= 2
      AND (cpe.version STARTS WITH (vp[0] + '.' + vp[1] + '.')
           OR cpe.version = (vp[0] + '.' + vp[1]))
    RETURN count(DISTINCT cve) AS n
  `,
  MAJOR: `
    ${ASSET_BASE}
    WHERE c.version IS NOT NULL
    WITH cve, c, cpe, split(c.version, '.') AS vp
    WHERE size(vp) >= 1
      AND (cpe.version STARTS WITH (vp[0] + '.')
           OR cpe.version = vp[0])
    RETURN count(DISTINCT cve) AS n
  `,
  BEAST: `${ASSET_BASE} RETURN count(DISTINCT cve) AS n`,
};
