import DataLoader from 'dataloader';
import { getSession } from '../db/neo4j.js';
import type { MatchMode } from '../assets/types.js';

export interface CveCountKey {
  assetId: string;
  mode: MatchMode;
}

export interface AppLoaders {
  cveCountByAssetMode: DataLoader<CveCountKey, number>;
}

// Per-asset CVE count, batched via UNWIND. UNIONs the SBOM chain (mode-
// filtered) with the ATTRIBUTED_CVE direct path so the count matches what
// Asset.cves(mode) returns. Mirrors the structure of match.repo.ts.
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

function buildCountQuery(mode: MatchMode): string {
  return `
    UNWIND $assetIds AS aid
    MATCH (a:Asset {id: aid, tenantId: $tenantId})
    CALL {
      WITH a
      MATCH (a)-[:HAS_COMPONENT]->(c:SoftwareComponent)
            -[:OF_PRODUCT]->(p:Product)-[:HAS_CPE]->(cpe:CPE)<-[:AFFECTS]-(cve:CVE)
      ${chainModeFilter(mode)}
      RETURN cve
      UNION
      WITH a
      MATCH (a)-[:ATTRIBUTED_CVE]->(cve:CVE)
      RETURN cve
    }
    WITH a, cve
    RETURN a.id AS assetId, count(DISTINCT cve) AS n
  `;
}

const BATCHED_CVE_COUNT: Record<MatchMode, string> = {
  EXACT: buildCountQuery('EXACT'),
  MAJOR_MINOR: buildCountQuery('MAJOR_MINOR'),
  MAJOR: buildCountQuery('MAJOR'),
  BEAST: buildCountQuery('BEAST'),
};

async function loadCveCounts(
  tenantId: string,
  keys: readonly CveCountKey[],
): Promise<number[]> {
  const grouped = new Map<MatchMode, string[]>();
  for (const key of keys) {
    const ids = grouped.get(key.mode);
    if (ids) ids.push(key.assetId);
    else grouped.set(key.mode, [key.assetId]);
  }

  const counts = new Map<string, number>();
  const session = getSession();
  try {
    for (const [mode, assetIds] of grouped) {
      const result = await session.run(BATCHED_CVE_COUNT[mode], { tenantId, assetIds });
      for (const record of result.records) {
        counts.set(
          `${mode}:${record.get('assetId') as string}`,
          Number(record.get('n') ?? 0),
        );
      }
    }
  } finally {
    await session.close();
  }

  return keys.map((key) => counts.get(`${key.mode}:${key.assetId}`) ?? 0);
}

export function createLoaders(tenantId: string): AppLoaders {
  return {
    cveCountByAssetMode: new DataLoader<CveCountKey, number, string>(
      (keys) => loadCveCounts(tenantId, keys),
      { cacheKeyFn: (key) => `${key.mode}:${key.assetId}` },
    ),
  };
}
