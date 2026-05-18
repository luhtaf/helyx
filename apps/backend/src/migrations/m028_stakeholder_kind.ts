import type { Migration } from './types.js';

// Phase R — Stakeholder polymorphism via a `kind` discriminator.
// Additive + backward-compatible: legacy rows backfill to 'ORG'
// (idempotent — re-running matches nothing once set), and the repo
// RETURNs coalesce(k.kind,'ORG') so a row missing kind never breaks
// the non-null GraphQL field. SoT for the enum lives in
// stakeholders/kinds.ts (STAKEHOLDER_KINDS).
export const m028_stakeholder_kind: Migration = {
  id: '028_stakeholder_kind',
  description: 'Stakeholder.kind discriminator — backfill legacy rows to ORG + (tenantId,kind) index',
  up: [
    `MATCH (k:Stakeholder) WHERE k.kind IS NULL SET k.kind = 'ORG'`,
    `CREATE INDEX stakeholder_tenant_kind IF NOT EXISTS
     FOR (k:Stakeholder) ON (k.tenantId, k.kind)`,
  ],
};
