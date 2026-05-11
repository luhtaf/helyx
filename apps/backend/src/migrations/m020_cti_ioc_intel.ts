import type { Migration } from './types.js';

// W2.5 — Tenant intel-pool IOCs attributed to (Actor × TTP) pairs.
// Distinct from :Artifact:Ioc (which is case-bound) — these are loose
// tenant-wide intel that operators add on-the-spot when they learn
// "APT38 uses domain X for T1486". Promoted into a Case as a regular
// :Artifact:Ioc later via copy-into-case (future task).
//
// Tenant scope is direct on the node (no parent Case), so query path
// is simpler than artifacts (no HAS_ARTIFACT join needed).
//
// Edges:
//   (:CtiIoc)-[:ATTRIBUTED_TO]->(:IntrusionSet)  -- actor scope
//   (:CtiIoc)-[:HINTS_AT_TTP]->(:AttackPattern)  -- TTP scope (reuses
//                                                  edge type from
//                                                  artifacts/repo.ts)
//
// Indexes support the lookup pattern from the actor-scoped TTP graph:
//   "indicators for (actor X, technique Y) for tenant Z".
export const m020_cti_ioc_intel: Migration = {
  id: '020_cti_ioc_intel',
  description: 'W2.5 — :CtiIoc tenant intel-pool IOCs attributed to Actor × TTP edges. Loose tenant intel, not case-bound.',
  up: [
    `CREATE CONSTRAINT cti_ioc_id_unique IF NOT EXISTS
     FOR (i:CtiIoc) REQUIRE i.id IS UNIQUE`,

    `CREATE INDEX cti_ioc_tenant_value IF NOT EXISTS
     FOR (i:CtiIoc) ON (i.tenantId, i.value)`,

    `CREATE INDEX cti_ioc_tenant_type IF NOT EXISTS
     FOR (i:CtiIoc) ON (i.tenantId, i.iocType)`,

    // Composite: "indicators added recently in this tenant"
    `CREATE INDEX cti_ioc_tenant_added_at IF NOT EXISTS
     FOR (i:CtiIoc) ON (i.tenantId, i.addedAt)`,

    // Fulltext for the indicators panel search bar
    `CREATE FULLTEXT INDEX cti_ioc_search IF NOT EXISTS
     FOR (i:CtiIoc) ON EACH [i.value, i.notes]`,
  ],
};
