import { randomUUID } from 'node:crypto';
import { getSession } from '../../db/neo4j.js';
import type { MappedBatch } from './mapper.js';

export interface WriteStats {
  stakeholdersUpserted: number;
  assetsUpserted: number;
  ownsUpserted: number;
  componentsUpserted: number;
  ofProductLinks: number;
  attributedCves: number;
  attributedMissingCves: number;
}

/**
 * Persist a mapped batch in one executeWrite. Order matters:
 *   1. Stakeholder MERGE   (anchor for OWNS)
 *   2. Asset MERGE         (anchor for OWNS + HAS_COMPONENT)
 *   3. Stakeholder→OWNS→Asset
 *   4. SoftwareComponent + HAS_COMPONENT + OF_PRODUCT (Product must
 *      already exist via elk:sync; missing Products are silently ignored
 *      so a partially-seeded catalog still ingests)
 *
 * All MERGE keys are tenant-scoped. SoftwareComponent has a unique
 * constraint on (tenantId, purl) per m004.
 */
export async function writeBatch(batch: MappedBatch): Promise<WriteStats> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Pre-generate UUIDs so MERGE ON CREATE doesn't need to call randomUUID()
      // server-side per row (Neo4j randomUUID() works but slows the bulk path).
      const stakeholderRows = batch.stakeholders.map((s) => ({ ...s, id: randomUUID() }));
      const assetRows = batch.assets.map((a) => ({ ...a, id: randomUUID() }));
      const componentRows = batch.components.map((c) => ({ ...c, id: randomUUID() }));

      // 1. Stakeholders + sektor link
      await tx.run(
        `UNWIND $rows AS row
         MERGE (k:Stakeholder {tenantId: row.tenantId, slug: row.slug})
         ON CREATE SET
           k.id = row.id,
           k.name = row.name,
           k.aliases = [],
           k.status = 'ACTIVE',
           k.createdAt = datetime(),
           k.updatedAt = datetime()
         ON MATCH SET k.updatedAt = datetime()
         WITH k, row
         WHERE row.sektorSlug IS NOT NULL
         OPTIONAL MATCH (s:Sektor {slug: row.sektorSlug})
         FOREACH (_ IN CASE WHEN s IS NOT NULL THEN [1] ELSE [] END |
           MERGE (k)-[:IN_SEKTOR]->(s))`,
        { rows: stakeholderRows },
      );

      // 2. Assets
      await tx.run(
        `UNWIND $rows AS row
         MERGE (a:Asset {tenantId: row.tenantId, hostname: row.hostname})
         ON CREATE SET
           a.id = row.id,
           a.kind = row.kind,
           a.name = row.hostname,
           a.ipAddresses = [],
           a.source = 'spiderfoot',
           a.scanName = row.scanName,
           a.createdAt = datetime(),
           a.updatedAt = datetime()
         ON MATCH SET
           a.scanName = coalesce(row.scanName, a.scanName),
           a.updatedAt = datetime()`,
        { rows: assetRows },
      );

      // 3. Stakeholder→OWNS→Asset
      await tx.run(
        `UNWIND $rows AS row
         MATCH (k:Stakeholder {tenantId: row.tenantId, slug: row.stakeholderSlug})
         MATCH (a:Asset {tenantId: row.tenantId, hostname: row.assetHostname})
         MERGE (k)-[:OWNS]->(a)`,
        { rows: batch.owns },
      );

      // 4. SoftwareComponent + HAS_COMPONENT + OF_PRODUCT
      // Product MERGE-by-(vendor,product) lookup intentionally non-creating:
      // CVE catalog (elk:sync) owns Product nodes. A miss here means the
      // ingested CVE has a vendor/product not in our catalog yet; we still
      // create the SoftwareComponent so the asset's surface is recorded.
      const ofProductResult = await tx.run(
        `UNWIND $rows AS row
         MATCH (a:Asset {tenantId: row.tenantId, hostname: row.assetHostname})
         MERGE (c:SoftwareComponent {tenantId: row.tenantId, purl: row.purl})
         ON CREATE SET
           c.id = row.id,
           c.name = row.product,
           c.version = row.version,
           c.createdAt = datetime()
         MERGE (a)-[:HAS_COMPONENT]->(c)
         WITH c, row
         OPTIONAL MATCH (p:Product {vendorSlug: coalesce(row.vendorSlug, 'generic'), slug: row.productSlug})
         FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
           MERGE (c)-[:OF_PRODUCT]->(p))
         RETURN sum(CASE WHEN p IS NOT NULL THEN 1 ELSE 0 END) AS linked`,
        { rows: componentRows },
      );

      // 5. Asset→ATTRIBUTED_CVE→CVE — external attribution by Spiderfoot.
      // Only links to CVE nodes that already exist in the catalog (elk:sync).
      // Missing CVEs are silently counted; operator can re-run after a fresh
      // elk:sync if catalog was incomplete at ingest time.
      let attributedCves = 0;
      let attributedMissingCves = 0;
      if (batch.attributedCves.length > 0) {
        const r = await tx.run(
          `UNWIND $rows AS row
           MATCH (a:Asset {tenantId: row.tenantId, hostname: row.assetHostname})
           OPTIONAL MATCH (cve:CVE {id: row.cveId})
           FOREACH (_ IN CASE WHEN cve IS NOT NULL THEN [1] ELSE [] END |
             MERGE (a)-[r:ATTRIBUTED_CVE]->(cve)
             ON CREATE SET
               r.source = 'spiderfoot',
               r.score = row.score,
               r.severity = row.severity,
               r.scanName = row.scanName,
               r.firstSeenAt = datetime(),
               r.lastSeenAt = datetime()
             ON MATCH SET
               r.score = coalesce(row.score, r.score),
               r.severity = coalesce(row.severity, r.severity),
               r.lastSeenAt = datetime())
           RETURN
             sum(CASE WHEN cve IS NOT NULL THEN 1 ELSE 0 END) AS linked,
             sum(CASE WHEN cve IS NULL THEN 1 ELSE 0 END) AS missing`,
          { rows: batch.attributedCves },
        );
        attributedCves = Number(r.records[0]?.get('linked') ?? 0);
        attributedMissingCves = Number(r.records[0]?.get('missing') ?? 0);
      }

      return {
        stakeholdersUpserted: stakeholderRows.length,
        assetsUpserted: assetRows.length,
        ownsUpserted: batch.owns.length,
        componentsUpserted: componentRows.length,
        ofProductLinks: Number(ofProductResult.records[0]?.get('linked') ?? 0),
        attributedCves,
        attributedMissingCves,
      };
    });
  } finally {
    await session.close();
  }
}
