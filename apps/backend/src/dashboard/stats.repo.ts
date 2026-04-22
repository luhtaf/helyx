import { getSession } from '../db/neo4j.js';
import type { AssetKind, MatchMode } from '../assets/types.js';
import { TENANT_CVE_BASE } from '../cves/cypher.js';

export interface AssetKindCount {
  kind: AssetKind;
  count: number;
}

export interface SeverityCount {
  severity: string | null;
  count: number;
}

export interface TenantCve {
  cveId: string;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
  affectedAssetCount: number;
}

export async function countAssets(tenantId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {tenantId: $tenantId}) RETURN count(a) AS n`,
      { tenantId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function countAssetsByKind(tenantId: string): Promise<AssetKindCount[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {tenantId: $tenantId})
       RETURN a.kind AS kind, count(*) AS count
       ORDER BY count DESC, kind`,
      { tenantId },
    );
    return r.records.map((rec) => ({
      kind: rec.get('kind') as AssetKind,
      count: Number(rec.get('count')),
    }));
  } finally {
    await session.close();
  }
}

export async function countComponents(tenantId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Asset {tenantId: $tenantId})-[:HAS_COMPONENT]->(c:SoftwareComponent {tenantId: $tenantId})
       RETURN count(DISTINCT c) AS n`,
      { tenantId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

const TENANT_CVE_CYPHER = TENANT_CVE_BASE;

export async function countTenantCves(tenantId: string, mode: MatchMode): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `${TENANT_CVE_CYPHER[mode]}
       RETURN count(DISTINCT cve) AS n`,
      { tenantId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function countTenantCvesBySeverity(
  tenantId: string,
  mode: MatchMode,
): Promise<SeverityCount[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `${TENANT_CVE_CYPHER[mode]}
       WITH DISTINCT cve
       RETURN cve.cvssV31BaseSeverity AS severity, count(*) AS count
       ORDER BY count DESC`,
      { tenantId },
    );
    return r.records.map((rec) => ({
      severity: (rec.get('severity') as string | null) ?? null,
      count: Number(rec.get('count')),
    }));
  } finally {
    await session.close();
  }
}

export async function listRecentTenantCves(
  tenantId: string,
  mode: MatchMode,
  limit: number,
): Promise<TenantCve[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `${TENANT_CVE_CYPHER[mode]}
       WITH cve, count(DISTINCT a) AS assetCount
       RETURN cve.id AS cveId,
              cve.cvssV31BaseSeverity AS severity,
              cve.cvssV31BaseScore AS score,
              toString(cve.publishedAt) AS publishedAt,
              assetCount
       ORDER BY cve.publishedAt DESC, coalesce(cve.cvssV31BaseScore, 0) DESC
       LIMIT $limit`,
      { tenantId, limit: BigInt(limit) },
    );
    return r.records.map((rec) => ({
      cveId: rec.get('cveId') as string,
      severity: (rec.get('severity') as string | null) ?? null,
      baseScore: (rec.get('score') as number | null) ?? null,
      publishedAt: (rec.get('publishedAt') as string | null) ?? null,
      affectedAssetCount: Number(rec.get('assetCount')),
    }));
  } finally {
    await session.close();
  }
}

export async function countTopTenantCves(
  tenantId: string,
  mode: MatchMode,
  limit: number,
): Promise<TenantCve[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `${TENANT_CVE_CYPHER[mode]}
       WITH cve, count(DISTINCT a) AS assetCount
       RETURN cve.id AS cveId,
              cve.cvssV31BaseSeverity AS severity,
              cve.cvssV31BaseScore AS score,
              toString(cve.publishedAt) AS publishedAt,
              assetCount
       ORDER BY coalesce(cve.cvssV31BaseScore, 0) DESC, cve.id DESC
       LIMIT $limit`,
      { tenantId, limit: BigInt(limit) },
    );
    return r.records.map((rec) => ({
      cveId: rec.get('cveId') as string,
      severity: (rec.get('severity') as string | null) ?? null,
      baseScore: (rec.get('score') as number | null) ?? null,
      publishedAt: (rec.get('publishedAt') as string | null) ?? null,
      affectedAssetCount: Number(rec.get('assetCount')),
    }));
  } finally {
    await session.close();
  }
}
