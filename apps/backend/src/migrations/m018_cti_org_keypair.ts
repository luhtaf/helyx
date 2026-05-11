import type { Migration } from './types.js';

// F2 — Org-level Ed25519 keypair for signing exported STIX bundles.
// One keypair per tenant org. Public key shared with partner agencies
// out-of-band so they can verify origin of pushed/exported intel.
// Private key stored encrypted at rest via libsodium secretbox; key
// derivation from CTI_SIGNING_MASTER_KEY env var (NEVER from JWT_SECRET
// per Copilot finding — separate secret tier for data-at-rest crypto).
//
// Approval state on :DetectionRule (approvedByUserId + approvalContentHash)
// added as properties; approval audit chain via separate :RuleApproval node.
export const m018_cti_org_keypair: Migration = {
  id: '018_cti_org_keypair',
  description: 'F2 — Ed25519 keypair per org for signing CTI exports. Approval state machine on DetectionRule.',
  up: [
    `CREATE CONSTRAINT cti_org_keypair_id_unique IF NOT EXISTS
     FOR (k:CtiOrgKeypair) REQUIRE k.id IS UNIQUE`,

    `CREATE CONSTRAINT cti_org_keypair_tenant_unique IF NOT EXISTS
     FOR (k:CtiOrgKeypair) REQUIRE k.tenantId IS UNIQUE`,

    `CREATE INDEX cti_org_keypair_tenant IF NOT EXISTS
     FOR (k:CtiOrgKeypair) ON (k.tenantId)`,

    // Approval audit — every approve/reject emits a :RuleApproval
    `CREATE CONSTRAINT rule_approval_id_unique IF NOT EXISTS
     FOR (a:RuleApproval) REQUIRE a.id IS UNIQUE`,

    `CREATE INDEX rule_approval_tenant_rule IF NOT EXISTS
     FOR (a:RuleApproval) ON (a.tenantId, a.ruleId)`,
  ],
};
