import type { Migration } from './types.js';

// F2 keypair rotation — multiple :CtiOrgKeypair per tenant, exactly one
// with status='active' at any time. Older keys keep status='previous'
// (still valid for verifying historical bundles via :SIGNED_BY edge) or
// 'revoked' (operator declared this key compromised — bundles signed by
// it are mistrust-flagged downstream).
//
// Existing rows pre-rotation get backfilled status='active'. Drop the
// tenantId UNIQUE constraint that m018 set (was correct under
// "one keypair per tenant" model, blocks rotation now).
export const m021_cti_keypair_rotation: Migration = {
  id: '021_cti_keypair_rotation',
  description: 'F2 — Drop tenant-unique on CtiOrgKeypair, add status + rotation audit chain.',
  up: [
    `DROP CONSTRAINT cti_org_keypair_tenant_unique IF EXISTS`,

    // Composite (tenantId, status) index — fast active-key lookup. The
    // existing single-prop tenantId index from m018 stays for full-list
    // queries.
    `CREATE INDEX cti_org_keypair_tenant_status IF NOT EXISTS
     FOR (k:CtiOrgKeypair) ON (k.tenantId, k.status)`,

    // Backfill — every pre-rotation keypair becomes the tenant's active
    // key. status missing → 'active'. Idempotent.
    `MATCH (k:CtiOrgKeypair) WHERE k.status IS NULL SET k.status = 'active'`,

    // Rotation event — append-only ledger. Resolver writes one per
    // rotate/revoke. Separate from :AuditEvent so policy queries
    // ("show me every rotation in 2026") don't scan the noisy global
    // audit stream.
    `CREATE CONSTRAINT keypair_rotation_id_unique IF NOT EXISTS
     FOR (r:KeypairRotation) REQUIRE r.id IS UNIQUE`,

    `CREATE INDEX keypair_rotation_tenant_ts IF NOT EXISTS
     FOR (r:KeypairRotation) ON (r.tenantId, r.ts)`,
  ],
};
