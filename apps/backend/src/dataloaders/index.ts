import DataLoader from 'dataloader';
import { getSession } from '../db/neo4j.js';
import { TENANT_CVE_BASE } from '../cves/cypher.js';
import type { MatchMode } from '../assets/types.js';

export interface CveCountKey {
  assetId: string;
  mode: MatchMode;
}

export interface AppLoaders {
  cveCountByAssetMode: DataLoader<CveCountKey, number>;
}

const BATCHED_CVE_COUNT: Record<MatchMode, string> = {
  EXACT: buildCountQuery('EXACT'),
  MAJOR_MINOR: buildCountQuery('MAJOR_MINOR'),
  MAJOR: buildCountQuery('MAJOR'),
  BEAST: buildCountQuery('BEAST'),
};

function buildCountQuery(mode: MatchMode): string {
  return TENANT_CVE_BASE[mode].replace(
    'MATCH (a:Asset {tenantId: $tenantId})-[:HAS_COMPONENT]->(c:SoftwareComponent)',
    `UNWIND $assetIds AS aid
     MATCH (a:Asset {tenantId: $tenantId})
     WHERE a.id = aid
     MATCH (a)-[:HAS_COMPONENT]->(c:SoftwareComponent)`,
  ) + `
    RETURN a.id AS assetId, count(DISTINCT cve) AS n
  `;
}

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
