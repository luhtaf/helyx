import type { Migration } from './types.js';

export const m011_master_data_schema: Migration = {
  id: '011_master_data_schema',
  description: 'Master data — Sektor (taxonomy), Stakeholder (monitored entity), RawStakeholder (reconciliation queue)',
  up: [
    // Sektor — global taxonomy (no tenantId; shared across orgs)
    `CREATE CONSTRAINT sektor_id_unique IF NOT EXISTS
     FOR (s:Sektor) REQUIRE s.id IS UNIQUE`,
    `CREATE CONSTRAINT sektor_slug_unique IF NOT EXISTS
     FOR (s:Sektor) REQUIRE s.slug IS UNIQUE`,
    `CREATE INDEX sektor_name IF NOT EXISTS
     FOR (s:Sektor) ON (s.name)`,

    // Stakeholder — tenant-scoped
    `CREATE CONSTRAINT stakeholder_id_unique IF NOT EXISTS
     FOR (k:Stakeholder) REQUIRE k.id IS UNIQUE`,
    `CREATE INDEX stakeholder_tenant IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.tenantId)`,
    `CREATE INDEX stakeholder_slug IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.slug)`,
    `CREATE INDEX stakeholder_name IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.name)`,
    `CREATE FULLTEXT INDEX stakeholder_search IF NOT EXISTS
     FOR (k:Stakeholder) ON EACH [k.name, k.aliases]`,

    // RawStakeholder — tenant-scoped reconciliation queue
    `CREATE CONSTRAINT raw_stakeholder_id_unique IF NOT EXISTS
     FOR (r:RawStakeholder) REQUIRE r.id IS UNIQUE`,
    `CREATE CONSTRAINT raw_stakeholder_key_unique IF NOT EXISTS
     FOR (r:RawStakeholder) REQUIRE (r.tenantId, r.source, r.normalizedKey) IS UNIQUE`,
    `CREATE INDEX raw_stakeholder_tenant_status IF NOT EXISTS
     FOR (r:RawStakeholder) ON (r.tenantId, r.status)`,
    `CREATE INDEX raw_stakeholder_hit_count IF NOT EXISTS
     FOR (r:RawStakeholder) ON (r.hitCount)`,
  ],
};
