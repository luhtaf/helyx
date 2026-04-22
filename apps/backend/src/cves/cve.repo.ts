import { getSession } from '../db/neo4j.js';
import type { MatchMode } from '../assets/types.js';
import { TENANT_CVE_BASE } from './cypher.js';

export interface CveDetail {
  id: string;
  description: string | null;
  vulnStatus: string | null;
  sourceIdentifier: string | null;
  publishedAt: string | null;
  lastModifiedAt: string | null;
  cvssV31BaseScore: number | null;
  cvssV31BaseSeverity: string | null;
  cvssV31VectorString: string | null;
  cvssV2BaseScore: number | null;
  cvssV2BaseSeverity: string | null;
  cvssV2VectorString: string | null;
}

export interface CweRef { id: string; name: string | null }
export interface ReferenceRef { url: string; source: string | null; tags: string[] }
export interface AffectedAssetRow {
  assetId: string;
  assetName: string;
  assetKind: string;
  componentPurl: string | null;
  matchMode: 'EXACT' | 'BEAST';
}
export interface TenantCveRow {
  cveId: string;
  description: string | null;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
  affectedAssetCount: number;
}

export async function getCve(id: string): Promise<CveDetail | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (cve:CVE {id: $id})
       RETURN cve.id AS id, cve.description AS description,
              cve.vulnStatus AS vulnStatus, cve.sourceIdentifier AS sourceIdentifier,
              toString(cve.publishedAt) AS publishedAt,
              toString(cve.lastModifiedAt) AS lastModifiedAt,
              cve.cvssV31BaseScore AS cvssV31BaseScore,
              cve.cvssV31BaseSeverity AS cvssV31BaseSeverity,
              cve.cvssV31VectorString AS cvssV31VectorString,
              cve.cvssV2BaseScore AS cvssV2BaseScore,
              cve.cvssV2BaseSeverity AS cvssV2BaseSeverity,
              cve.cvssV2VectorString AS cvssV2VectorString`,
      { id },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return {
      id: rec.get('id') as string,
      description: (rec.get('description') as string | null) ?? null,
      vulnStatus: (rec.get('vulnStatus') as string | null) ?? null,
      sourceIdentifier: (rec.get('sourceIdentifier') as string | null) ?? null,
      publishedAt: (rec.get('publishedAt') as string | null) ?? null,
      lastModifiedAt: (rec.get('lastModifiedAt') as string | null) ?? null,
      cvssV31BaseScore: (rec.get('cvssV31BaseScore') as number | null) ?? null,
      cvssV31BaseSeverity: (rec.get('cvssV31BaseSeverity') as string | null) ?? null,
      cvssV31VectorString: (rec.get('cvssV31VectorString') as string | null) ?? null,
      cvssV2BaseScore: (rec.get('cvssV2BaseScore') as number | null) ?? null,
      cvssV2BaseSeverity: (rec.get('cvssV2BaseSeverity') as string | null) ?? null,
      cvssV2VectorString: (rec.get('cvssV2VectorString') as string | null) ?? null,
    };
  } finally {
    await session.close();
  }
}

export async function listCveWeaknesses(cveId: string): Promise<CweRef[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:CVE {id: $cveId})-[:WEAKNESS]->(w:CWE)
       RETURN w.id AS id, w.name AS name
       ORDER BY w.id`,
      { cveId },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      name: (rec.get('name') as string | null) ?? null,
    }));
  } finally {
    await session.close();
  }
}

export async function listCveReferences(cveId: string): Promise<ReferenceRef[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:CVE {id: $cveId})-[:REFERENCES]->(r:Reference)
       RETURN r.url AS url, r.source AS source, coalesce(r.tags, []) AS tags
       ORDER BY r.source, r.url`,
      { cveId },
    );
    return r.records.map((rec) => ({
      url: rec.get('url') as string,
      source: (rec.get('source') as string | null) ?? null,
      tags: (rec.get('tags') as string[]) ?? [],
    }));
  } finally {
    await session.close();
  }
}

const AFFECTED_BASE = `
  MATCH (cve:CVE {id: $cveId})-[:AFFECTS]->(cpe:CPE)<-[:HAS_CPE]-(:Product)
        <-[:OF_PRODUCT]-(sc:SoftwareComponent {tenantId: $tenantId})
        <-[:HAS_COMPONENT]-(a:Asset {tenantId: $tenantId})
  WITH a, sc, cpe,
       CASE WHEN sc.version IS NOT NULL AND cpe.version = sc.version THEN 'EXACT' ELSE 'BEAST' END AS bridgeMode
  WITH a, collect({purl: sc.purl, mode: bridgeMode}) AS bridges
  WITH a,
       CASE WHEN any(b IN bridges WHERE b.mode = 'EXACT') THEN 'EXACT' ELSE 'BEAST' END AS matchMode,
       head([b IN bridges | b.purl]) AS componentPurl
`;

export async function listAffectedAssets(
  cveId: string,
  tenantId: string,
  page: number,
  perPage: number,
): Promise<AffectedAssetRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `${AFFECTED_BASE}
       RETURN a.id AS assetId, a.name AS assetName, a.kind AS assetKind,
              componentPurl, matchMode
       ORDER BY (matchMode = 'EXACT') DESC, a.name
       SKIP $skip LIMIT $limit`,
      { cveId, tenantId, skip: BigInt(Math.max(0, (page - 1) * perPage)), limit: BigInt(perPage) },
    );
    return r.records.map((rec) => ({
      assetId: rec.get('assetId') as string,
      assetName: rec.get('assetName') as string,
      assetKind: rec.get('assetKind') as string,
      componentPurl: (rec.get('componentPurl') as string | null) ?? null,
      matchMode: rec.get('matchMode') as 'EXACT' | 'BEAST',
    }));
  } finally {
    await session.close();
  }
}

export async function countAffectedAssets(cveId: string, tenantId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `${AFFECTED_BASE} RETURN count(a) AS total`,
      { cveId, tenantId },
    );
    return Number(r.records[0]?.get('total') ?? 0);
  } finally {
    await session.close();
  }
}

export interface TenantCveFilter {
  severity?: string | null;
  search?: string | null;
}

export async function listTenantCves(
  tenantId: string,
  mode: MatchMode,
  filter: TenantCveFilter,
  page: number,
  perPage: number,
): Promise<TenantCveRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `${TENANT_CVE_BASE[mode]}
       WITH cve, count(DISTINCT a) AS assetCount
       WHERE ($severity IS NULL OR cve.cvssV31BaseSeverity = $severity)
         AND ($search IS NULL OR cve.id CONTAINS toUpper($search))
       RETURN cve.id AS cveId, cve.description AS description,
              cve.cvssV31BaseSeverity AS severity, cve.cvssV31BaseScore AS score,
              toString(cve.publishedAt) AS publishedAt, assetCount
       ORDER BY coalesce(cve.cvssV31BaseScore, 0) DESC, cve.id DESC
       SKIP $skip LIMIT $limit`,
      {
        tenantId,
        severity: filter.severity ?? null,
        search: filter.search ?? null,
        skip: BigInt(Math.max(0, (page - 1) * perPage)),
        limit: BigInt(perPage),
      },
    );
    return r.records.map((rec) => ({
      cveId: rec.get('cveId') as string,
      description: (rec.get('description') as string | null) ?? null,
      severity: (rec.get('severity') as string | null) ?? null,
      baseScore: (rec.get('score') as number | null) ?? null,
      publishedAt: (rec.get('publishedAt') as string | null) ?? null,
      affectedAssetCount: Number(rec.get('assetCount')),
    }));
  } finally {
    await session.close();
  }
}

export async function countTenantCves(
  tenantId: string,
  mode: MatchMode,
  filter: TenantCveFilter,
): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `${TENANT_CVE_BASE[mode]}
       WITH cve
       WHERE ($severity IS NULL OR cve.cvssV31BaseSeverity = $severity)
         AND ($search IS NULL OR cve.id CONTAINS toUpper($search))
       RETURN count(DISTINCT cve) AS total`,
      { tenantId, severity: filter.severity ?? null, search: filter.search ?? null },
    );
    return Number(r.records[0]?.get('total') ?? 0);
  } finally {
    await session.close();
  }
}
