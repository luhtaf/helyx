import type { Migration } from './types.js';

export const m001_initial_schema: Migration = {
  id: '001_initial_schema',
  description: 'Vendor, Product, CPE, CVE, CWE, Reference — uniqueness + lookup indexes',
  up: [
    `CREATE CONSTRAINT vendor_slug_unique IF NOT EXISTS
     FOR (v:Vendor) REQUIRE v.slug IS UNIQUE`,

    `CREATE CONSTRAINT product_vendor_slug_unique IF NOT EXISTS
     FOR (p:Product) REQUIRE (p.vendorSlug, p.slug) IS UNIQUE`,

    `CREATE CONSTRAINT cpe_uri_unique IF NOT EXISTS
     FOR (c:CPE) REQUIRE c.uri IS UNIQUE`,

    `CREATE CONSTRAINT cve_id_unique IF NOT EXISTS
     FOR (c:CVE) REQUIRE c.id IS UNIQUE`,

    `CREATE CONSTRAINT cwe_id_unique IF NOT EXISTS
     FOR (w:CWE) REQUIRE w.id IS UNIQUE`,

    `CREATE CONSTRAINT reference_url_unique IF NOT EXISTS
     FOR (r:Reference) REQUIRE r.url IS UNIQUE`,

    `CREATE INDEX cve_published_at IF NOT EXISTS
     FOR (c:CVE) ON (c.publishedAt)`,

    `CREATE INDEX cve_last_modified_at IF NOT EXISTS
     FOR (c:CVE) ON (c.lastModifiedAt)`,

    `CREATE INDEX cve_severity IF NOT EXISTS
     FOR (c:CVE) ON (c.cvssV31BaseSeverity)`,

    `CREATE INDEX product_name IF NOT EXISTS
     FOR (p:Product) ON (p.name)`,

    `CREATE INDEX cpe_product IF NOT EXISTS
     FOR (c:CPE) ON (c.product)`,

    `CREATE INDEX cpe_vendor IF NOT EXISTS
     FOR (c:CPE) ON (c.vendor)`,

    `CREATE FULLTEXT INDEX cve_search IF NOT EXISTS
     FOR (c:CVE) ON EACH [c.id, c.description]`,

    `CREATE FULLTEXT INDEX product_search IF NOT EXISTS
     FOR (p:Product) ON EACH [p.name, p.slug]`,
  ],
};
