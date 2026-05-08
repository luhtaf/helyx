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
      componentPurl: (rec.get('componentPurl') as string | null) ?? '',
      cpeUri: (rec.get('cpeUri') as string | null) ?? '',
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

// Asset.cves UNIONs two CVE sources (parallel to Stakeholder.cves):
//   1. SBOM-style chain: HAS_COMPONENT → ... → CVE (mode-filtered)
//   2. Direct: ATTRIBUTED_CVE → CVE (Spiderfoot etc, no mode)
//
// Mode applies only to path 1. Path 2 is external scanner ground truth
// that already version-matched outside Helyx; reapplying our filter would
// throw away data.
//
// componentPurl / cpeUri are nullable in the returned shape — for ATTRIBUTED
// rows they are null because there's no SBOM component path. UI fallback to
// '—' or 'spiderfoot' label.

const ANCHOR = `MATCH (a:Asset {id: $assetId, tenantId: $tenantId})`;

const CHAIN_TAIL = `
  MATCH (a)-[:HAS_COMPONENT]->(c:SoftwareComponent)
        -[:OF_PRODUCT]->(p:Product)-[:HAS_CPE]->(cpe:CPE)<-[:AFFECTS]-(cve:CVE)
`;

function chainModeFilter(mode: MatchMode): string {
  switch (mode) {
    case 'EXACT':
      return 'WHERE c.version IS NOT NULL AND cpe.version = c.version';
    case 'MAJOR_MINOR':
      return `WHERE c.version IS NOT NULL
              AND size(split(c.version, '.')) >= 2
              AND (cpe.version STARTS WITH (split(c.version, '.')[0] + '.' + split(c.version, '.')[1] + '.')
                   OR cpe.version = (split(c.version, '.')[0] + '.' + split(c.version, '.')[1]))`;
    case 'MAJOR':
      return `WHERE c.version IS NOT NULL
              AND size(split(c.version, '.')) >= 1
              AND (cpe.version STARTS WITH (split(c.version, '.')[0] + '.')
                   OR cpe.version = split(c.version, '.')[0])`;
    case 'BEAST':
      return '';
  }
}

function listCypherFor(mode: MatchMode): string {
  return `
    ${ANCHOR}
    CALL {
      WITH a
      ${CHAIN_TAIL}
      ${chainModeFilter(mode)}
      RETURN cve, c.purl AS componentPurl, cpe.uri AS cpeUri
      UNION
      WITH a
      MATCH (a)-[:ATTRIBUTED_CVE]->(cve:CVE)
      RETURN cve, null AS componentPurl, null AS cpeUri
    }
    WITH cve,
         head([p IN collect(DISTINCT componentPurl) WHERE p IS NOT NULL]) AS componentPurl,
         head([u IN collect(DISTINCT cpeUri) WHERE u IS NOT NULL]) AS cpeUri
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
}

function countCypherFor(mode: MatchMode): string {
  return `
    ${ANCHOR}
    CALL {
      WITH a
      ${CHAIN_TAIL}
      ${chainModeFilter(mode)}
      RETURN cve
      UNION
      WITH a
      MATCH (a)-[:ATTRIBUTED_CVE]->(cve:CVE)
      RETURN cve
    }
    RETURN count(DISTINCT cve) AS n
  `;
}

const LIST_CYPHER: Record<MatchMode, string> = {
  EXACT: listCypherFor('EXACT'),
  MAJOR_MINOR: listCypherFor('MAJOR_MINOR'),
  MAJOR: listCypherFor('MAJOR'),
  BEAST: listCypherFor('BEAST'),
};

const COUNT_CYPHER: Record<MatchMode, string> = {
  EXACT: countCypherFor('EXACT'),
  MAJOR_MINOR: countCypherFor('MAJOR_MINOR'),
  MAJOR: countCypherFor('MAJOR'),
  BEAST: countCypherFor('BEAST'),
};
