import { getSession } from '../db/neo4j.js';
import { newId } from '../utils/uuid.js';
import type { MappedSbom } from './sbom.cyclonedx.js';

export interface IngestSbomInput {
  tenantId: string;
  assetId: string;
  sbom: MappedSbom;
  sourceFilename?: string | null;
}

export interface IngestSbomResult {
  sbomId: string;
  componentCount: number;
  componentsWithExplicitCpe: number;
  productLinkCount: number;
}

interface ComponentRow {
  id: string;
  purl: string;
  name: string;
  version: string | null;
  type: string | null;
  cpeUri: string | null;
  productSlugCandidates: string[];
}

export async function ingestSbom(input: IngestSbomInput): Promise<IngestSbomResult> {
  const sbomId = newId();
  const ingestedAt = new Date().toISOString();
  const session = getSession();

  const componentRows: ComponentRow[] = input.sbom.components.map((c) => ({
    id: newId(),
    purl: c.purl,
    name: c.name,
    version: c.version,
    type: c.type,
    cpeUri: c.cpeUri,
    productSlugCandidates: c.productSlugCandidates,
  }));

  const componentsWithExplicitCpe = componentRows.filter((c) => c.cpeUri).length;
  const productMatchRows = componentRows.flatMap((c) =>
    c.productSlugCandidates.map((slug) => ({ purl: c.purl, slug })),
  );

  try {
    return await session.executeWrite(async (tx) => {
      const assetCheck = await tx.run(
        `MATCH (a:Asset {id: $assetId, tenantId: $tenantId}) RETURN a.id AS id`,
        { assetId: input.assetId, tenantId: input.tenantId },
      );
      if (assetCheck.records.length === 0) {
        throw new Error('Asset not found in tenant');
      }

      await tx.run(
        `CREATE (s:Sbom {
           id: $sbomId, tenantId: $tenantId, format: $format, specVersion: $specVersion,
           ingestedAt: datetime($ingestedAt), sourceFilename: $sourceFilename,
           componentCount: $componentCount
         })
         WITH s
         MATCH (a:Asset {id: $assetId, tenantId: $tenantId})
         CREATE (s)-[:DESCRIBES]->(a)`,
        {
          sbomId,
          tenantId: input.tenantId,
          format: input.sbom.format,
          specVersion: input.sbom.specVersion,
          ingestedAt,
          sourceFilename: input.sourceFilename ?? null,
          componentCount: componentRows.length,
          assetId: input.assetId,
        },
      );

      if (componentRows.length === 0) {
        return { sbomId, componentCount: 0, componentsWithExplicitCpe: 0, productLinkCount: 0 };
      }

      await tx.run(
        `UNWIND $rows AS row
         MERGE (c:SoftwareComponent {tenantId: $tenantId, purl: row.purl})
         ON CREATE SET c.id = row.id, c.createdAt = datetime()
         SET c.name = row.name, c.version = row.version, c.type = row.type,
             c.cpeUri = row.cpeUri, c.lastSeenAt = datetime()`,
        { tenantId: input.tenantId, rows: componentRows },
      );

      await tx.run(
        `UNWIND $rows AS row
         MATCH (a:Asset {id: $assetId, tenantId: $tenantId}),
               (c:SoftwareComponent {tenantId: $tenantId, purl: row.purl})
         MERGE (a)-[h:HAS_COMPONENT]->(c)
         SET h.lastSbomId = $sbomId, h.lastSeenAt = datetime()`,
        { assetId: input.assetId, tenantId: input.tenantId, sbomId, rows: componentRows },
      );

      let productLinkCount = 0;
      if (productMatchRows.length) {
        const r = await tx.run(
          `UNWIND $rows AS row
           MATCH (c:SoftwareComponent {tenantId: $tenantId, purl: row.purl}),
                 (p:Product {slug: row.slug})
           MERGE (c)-[:OF_PRODUCT]->(p)
           RETURN count(*) AS matched`,
          { tenantId: input.tenantId, rows: productMatchRows },
        );
        productLinkCount = Number(r.records[0]?.get('matched') ?? 0);
      }

      return {
        sbomId,
        componentCount: componentRows.length,
        componentsWithExplicitCpe,
        productLinkCount,
      };
    });
  } finally {
    await session.close();
  }
}

export async function listComponents(tenantId: string, assetId: string, limit: number) {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {id: $assetId, tenantId: $tenantId})-[:HAS_COMPONENT]->(c:SoftwareComponent)
       RETURN c.id AS id, c.purl AS purl, c.name AS name, c.version AS version,
              c.type AS type, c.cpeUri AS cpeUri
       ORDER BY c.name
       LIMIT $limit`,
      { tenantId, assetId, limit: BigInt(limit) },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      purl: rec.get('purl') as string,
      name: rec.get('name') as string,
      version: (rec.get('version') as string | null) ?? null,
      type: (rec.get('type') as string | null) ?? null,
      cpeUri: (rec.get('cpeUri') as string | null) ?? null,
    }));
  } finally {
    await session.close();
  }
}

export async function countComponents(tenantId: string, assetId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Asset {id: $assetId, tenantId: $tenantId})-[:HAS_COMPONENT]->(c:SoftwareComponent)
       RETURN count(c) AS n`,
      { tenantId, assetId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}
