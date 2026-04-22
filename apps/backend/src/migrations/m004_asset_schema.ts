import type { Migration } from './types.js';

export const m004_asset_schema: Migration = {
  id: '004_asset_schema',
  description: 'Asset, SoftwareComponent, Sbom — tenant-scoped',
  up: [
    `CREATE CONSTRAINT asset_id_unique IF NOT EXISTS
     FOR (a:Asset) REQUIRE a.id IS UNIQUE`,

    `CREATE INDEX asset_tenant IF NOT EXISTS
     FOR (a:Asset) ON (a.tenantId)`,

    `CREATE INDEX asset_kind IF NOT EXISTS
     FOR (a:Asset) ON (a.kind)`,

    `CREATE INDEX asset_name IF NOT EXISTS
     FOR (a:Asset) ON (a.name)`,

    `CREATE FULLTEXT INDEX asset_search IF NOT EXISTS
     FOR (a:Asset) ON EACH [a.name, a.hostname]`,

    `CREATE CONSTRAINT software_component_tenant_purl_unique IF NOT EXISTS
     FOR (c:SoftwareComponent) REQUIRE (c.tenantId, c.purl) IS UNIQUE`,

    `CREATE INDEX software_component_purl IF NOT EXISTS
     FOR (c:SoftwareComponent) ON (c.purl)`,

    `CREATE INDEX software_component_name IF NOT EXISTS
     FOR (c:SoftwareComponent) ON (c.name)`,

    `CREATE CONSTRAINT sbom_id_unique IF NOT EXISTS
     FOR (s:Sbom) REQUIRE s.id IS UNIQUE`,

    `CREATE INDEX sbom_tenant IF NOT EXISTS
     FOR (s:Sbom) ON (s.tenantId)`,
  ],
};
