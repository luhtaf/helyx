import { getSession } from '../db/neo4j.js';
import { newId } from '../utils/uuid.js';
import type { AssetKind, AssetRecord } from './types.js';

const ASSET_RETURN = `
  a.id AS id, a.tenantId AS tenantId, a.kind AS kind, a.name AS name,
  a.hostname AS hostname, coalesce(a.ipAddresses, []) AS ipAddresses,
  toString(a.createdAt) AS createdAt, toString(a.updatedAt) AS updatedAt,
  size([(a)-[:CONTAINS]->(child) | child]) AS childCount
`;

function rowToAsset(rec: { get: (k: string) => unknown }): AssetRecord {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    kind: rec.get('kind') as AssetKind,
    name: rec.get('name') as string,
    hostname: (rec.get('hostname') as string | null) ?? null,
    ipAddresses: (rec.get('ipAddresses') as string[]) ?? [],
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
    childCount: Number(rec.get('childCount') ?? 0),
  };
}

export interface CreateAssetInput {
  tenantId: string;
  kind: AssetKind;
  name: string;
  hostname: string | null;
  ipAddresses: string[];
  parentId: string | null;
}

export async function createAsset(input: CreateAssetInput): Promise<AssetRecord> {
  const id = newId();
  const session = getSession();
  try {
    if (input.parentId) {
      const r = await session.run(
        `MATCH (parent:Asset {id: $parentId, tenantId: $tenantId})
         CREATE (a:Asset {
           id: $id, tenantId: $tenantId, kind: $kind, name: $name,
           hostname: $hostname, ipAddresses: $ipAddresses,
           createdAt: datetime(), updatedAt: datetime()
         })
         CREATE (parent)-[:CONTAINS]->(a)
         RETURN ${ASSET_RETURN}`,
        { id, ...input },
      );
      const rec = r.records[0];
      if (!rec) throw new Error('Parent asset not found in tenant');
      return rowToAsset(rec);
    }
    const r = await session.run(
      `CREATE (a:Asset {
         id: $id, tenantId: $tenantId, kind: $kind, name: $name,
         hostname: $hostname, ipAddresses: $ipAddresses,
         createdAt: datetime(), updatedAt: datetime()
       })
       RETURN ${ASSET_RETURN}`,
      { id, ...input },
    );
    return rowToAsset(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function findAssetById(tenantId: string, id: string): Promise<AssetRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {id: $id, tenantId: $tenantId}) RETURN ${ASSET_RETURN}`,
      { id, tenantId },
    );
    const rec = r.records[0];
    return rec ? rowToAsset(rec) : null;
  } finally {
    await session.close();
  }
}

export interface ListAssetsFilters {
  kind?: AssetKind | null;
  search?: string | null;
  page: number;
  perPage: number;
}

export async function listAssets(tenantId: string, filters: ListAssetsFilters): Promise<AssetRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {tenantId: $tenantId})
       WHERE ($kind IS NULL OR a.kind = $kind)
         AND ($search IS NULL OR toLower(a.name) CONTAINS toLower($search))
       RETURN ${ASSET_RETURN}
       ORDER BY a.createdAt DESC
       SKIP $skip LIMIT $limit`,
      {
        tenantId,
        kind: filters.kind ?? null,
        search: filters.search ?? null,
        skip: BigInt(Math.max(0, (filters.page - 1) * filters.perPage)),
        limit: BigInt(filters.perPage),
      },
    );
    return r.records.map(rowToAsset);
  } finally {
    await session.close();
  }
}

export async function countAssets(
  tenantId: string,
  filters: { kind?: AssetKind | null; search?: string | null },
): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {tenantId: $tenantId})
       WHERE ($kind IS NULL OR a.kind = $kind)
         AND ($search IS NULL OR toLower(a.name) CONTAINS toLower($search))
       RETURN count(a) AS n`,
      { tenantId, kind: filters.kind ?? null, search: filters.search ?? null },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function listRootAssets(tenantId: string, limit: number): Promise<AssetRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {tenantId: $tenantId})
       WHERE NOT (a)<-[:CONTAINS]-(:Asset)
       RETURN ${ASSET_RETURN}
       ORDER BY a.createdAt
       LIMIT $limit`,
      { tenantId, limit: BigInt(limit) },
    );
    return r.records.map(rowToAsset);
  } finally {
    await session.close();
  }
}

export async function listChildren(tenantId: string, parentId: string): Promise<AssetRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (parent:Asset {id: $parentId, tenantId: $tenantId})-[:CONTAINS]->(a:Asset)
       RETURN ${ASSET_RETURN}
       ORDER BY a.createdAt`,
      { tenantId, parentId },
    );
    return r.records.map(rowToAsset);
  } finally {
    await session.close();
  }
}

export async function findParent(tenantId: string, childId: string): Promise<AssetRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {id: $childId, tenantId: $tenantId})<-[:CONTAINS]-(parent:Asset)
       RETURN ${ASSET_RETURN.replace(/\ba\b/g, 'parent')}`,
      { tenantId, childId },
    );
    const rec = r.records[0];
    return rec ? rowToAsset(rec) : null;
  } finally {
    await session.close();
  }
}

export type DeleteMode = 'PROMOTE_CHILDREN' | 'CASCADE';

export interface DeleteAssetResult {
  deleted: boolean;
  deletedCount: number;
  promotedCount: number;
}

export async function deleteAsset(
  tenantId: string,
  id: string,
  mode: DeleteMode,
): Promise<DeleteAssetResult> {
  const session = getSession();
  try {
    if (mode === 'PROMOTE_CHILDREN') {
      const r = await session.run(
        `MATCH (a:Asset {id: $id, tenantId: $tenantId})
         OPTIONAL MATCH (a)-[:CONTAINS]->(child:Asset)
         OPTIONAL MATCH (parent:Asset)-[:CONTAINS]->(a)
         WITH a, parent, collect(DISTINCT child) AS children
         FOREACH (c IN children |
           FOREACH (_ IN CASE WHEN parent IS NULL THEN [] ELSE [1] END |
             MERGE (parent)-[:CONTAINS]->(c)
           )
         )
         WITH a, size(children) AS promoted
         DETACH DELETE a
         RETURN 1 AS deletedCount, promoted AS promotedCount`,
        { tenantId, id },
      );
      const rec = r.records[0];
      if (!rec) return { deleted: false, deletedCount: 0, promotedCount: 0 };
      return {
        deleted: true,
        deletedCount: Number(rec.get('deletedCount')),
        promotedCount: Number(rec.get('promotedCount')),
      };
    }

    const r = await session.run(
      `MATCH (root:Asset {id: $id, tenantId: $tenantId})
       OPTIONAL MATCH (root)-[:CONTAINS*0..]->(d:Asset)
       WITH collect(DISTINCT d) AS doomed
       UNWIND doomed AS x
       DETACH DELETE x
       RETURN size(doomed) AS deletedCount`,
      { tenantId, id },
    );
    const rec = r.records[0];
    const count = Number(rec?.get('deletedCount') ?? 0);
    return { deleted: count > 0, deletedCount: count, promotedCount: 0 };
  } finally {
    await session.close();
  }
}
