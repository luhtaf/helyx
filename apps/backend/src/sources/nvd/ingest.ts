import { getSession } from '../../db/neo4j.js';
import type { MappedBatch } from './mapper.js';

export async function writeBatch(batch: MappedBatch): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      if (batch.vendors.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (v:Vendor {slug: row.slug})
           ON CREATE SET v.name = row.name, v.createdAt = datetime()
           SET v.lastSeenAt = datetime()`,
          { rows: batch.vendors },
        );
      }

      if (batch.products.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (v:Vendor {slug: row.vendorSlug})
           MERGE (p:Product {vendorSlug: row.vendorSlug, slug: row.slug})
           ON CREATE SET p.name = row.name, p.createdAt = datetime()
           SET p.lastSeenAt = datetime()
           MERGE (v)-[:OWNS]->(p)`,
          { rows: batch.products },
        );
      }

      if (batch.cpes.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (c:CPE {uri: row.uri})
           SET c.part = row.part,
               c.vendor = row.vendor,
               c.product = row.product,
               c.version = row.version,
               c.update = row.update,
               c.edition = row.edition,
               c.language = row.language,
               c.swEdition = row.swEdition,
               c.targetSw = row.targetSw,
               c.targetHw = row.targetHw,
               c.other = row.other,
               c.lastSeenAt = datetime()`,
          { rows: batch.cpes },
        );
      }

      if (batch.vendorCpe.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (v:Vendor {slug: row.vendorSlug}), (c:CPE {uri: row.cpeUri})
           MERGE (v)-[:HAS_CPE]->(c)`,
          { rows: batch.vendorCpe },
        );
      }

      if (batch.productCpe.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (p:Product {vendorSlug: row.vendorSlug, slug: row.productSlug}),
                 (c:CPE {uri: row.cpeUri})
           MERGE (p)-[:HAS_CPE]->(c)`,
          { rows: batch.productCpe },
        );
      }

      if (batch.cves.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (c:CVE {id: row.id})
           SET c.description = row.description,
               c.vulnStatus = row.vulnStatus,
               c.sourceIdentifier = row.sourceIdentifier,
               c.publishedAt = datetime(row.publishedAt),
               c.lastModifiedAt = datetime(row.lastModifiedAt),
               c.cvssV31BaseScore = row.cvssV31BaseScore,
               c.cvssV31BaseSeverity = row.cvssV31BaseSeverity,
               c.cvssV31VectorString = row.cvssV31VectorString,
               c.cvssV2BaseScore = row.cvssV2BaseScore,
               c.cvssV2BaseSeverity = row.cvssV2BaseSeverity,
               c.cvssV2VectorString = row.cvssV2VectorString,
               c.ingestedAt = datetime()`,
          { rows: batch.cves },
        );
      }

      if (batch.cwes.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (w:CWE {id: row.id})`,
          { rows: batch.cwes },
        );
      }

      if (batch.cveCwe.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (c:CVE {id: row.cveId}), (w:CWE {id: row.cweId})
           MERGE (c)-[:WEAKNESS]->(w)`,
          { rows: batch.cveCwe },
        );
      }

      if (batch.references.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (r:Reference {url: row.url})
           SET r.source = row.source, r.tags = row.tags`,
          { rows: batch.references },
        );
      }

      if (batch.cveReferences.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (c:CVE {id: row.cveId}), (r:Reference {url: row.url})
           MERGE (c)-[:REFERENCES]->(r)`,
          { rows: batch.cveReferences },
        );
      }

      if (batch.affects.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (cve:CVE {id: row.cveId}), (cpe:CPE {uri: row.cpeUri})
           MERGE (cve)-[a:AFFECTS {matchCriteriaId: row.matchCriteriaId}]->(cpe)
           SET a.vulnerable = row.vulnerable,
               a.versionStartIncluding = row.versionStartIncluding,
               a.versionStartExcluding = row.versionStartExcluding,
               a.versionEndIncluding = row.versionEndIncluding,
               a.versionEndExcluding = row.versionEndExcluding`,
          { rows: batch.affects },
        );
      }
    });
  } finally {
    await session.close();
  }
}
