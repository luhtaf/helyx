import type { Migration } from './types.js';

// H7/H9 — CTI push targets (MISP, OpenCTI, TAXII, EclecticIQ) + per-
// attempt ledger.
//
// Target lifecycle:
//   - status='active'   normally pushable
//   - status='disabled' soft-delete; preserves attempt history
//
// dryRun=true (default for v1) — push runs all gate checks (F1c, F2,
// F3a, F3b) but stops short of actual HTTP. Outcome 'dry_run' so the
// audit trail reflects what *would* have happened. Operator flips to
// false when ready to wire real MISP/TAXII.
//
// :CtiPushAttempt is the per-push audit row: target + hunt + bundle
// hash + outcome (success/dry_run/denied_*/failed). Append-only.
export const m025_cti_push: Migration = {
  id: '025_cti_push',
  description: 'H7/H9 — CtiPushTarget + CtiPushAttempt for MISP/TAXII/EclecticIQ push paths.',
  up: [
    `CREATE CONSTRAINT cti_push_target_id_unique IF NOT EXISTS
     FOR (t:CtiPushTarget) REQUIRE t.id IS UNIQUE`,

    `CREATE INDEX cti_push_target_tenant_status IF NOT EXISTS
     FOR (t:CtiPushTarget) ON (t.tenantId, t.status)`,

    `CREATE CONSTRAINT cti_push_attempt_id_unique IF NOT EXISTS
     FOR (a:CtiPushAttempt) REQUIRE a.id IS UNIQUE`,

    // (tenantId, ts) covers the dashboard query "recent attempts in
    // this tenant". (targetId) covers per-target detail.
    `CREATE INDEX cti_push_attempt_tenant_ts IF NOT EXISTS
     FOR (a:CtiPushAttempt) ON (a.tenantId, a.ts)`,
    `CREATE INDEX cti_push_attempt_target IF NOT EXISTS
     FOR (a:CtiPushAttempt) ON (a.targetId)`,
  ],
};
