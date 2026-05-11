import type { Migration } from './types.js';

// F1 — Release control policy enforcement layer.
// Per-rule and per-hunt release tier; push pre-conditions check
// rule.releaseTierRank <= target.maxTierRank. See cti/kinds.ts for ranks.
//
// Properties on :DetectionRule and :Hunt are added inline (no separate
// :ReleasePolicy node — tier is intrinsic to the entity, not a join).
// Indexes support "all rules at tier X for tenant Y" queries used by
// cross-agency push validators.
export const m017_release_policy_schema: Migration = {
  id: '017_release_policy_schema',
  description: 'F1 — Release tier on DetectionRule + Hunt (4-tier: public/cross-agency/sectoral/internal). Tenant-scoped.',
  up: [
    // Composite index: "list rules at this tier for this tenant"
    `CREATE INDEX detection_rule_tenant_release_tier IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.tenantId, r.releaseTier)`,

    `CREATE INDEX hunt_tenant_release_tier IF NOT EXISTS
     FOR (h:Hunt) ON (h.tenantId, h.releaseTier)`,

    // Audit chain for tier changes (downgrade approval flow)
    `CREATE CONSTRAINT release_tier_change_id_unique IF NOT EXISTS
     FOR (c:ReleaseTierChange) REQUIRE c.id IS UNIQUE`,

    `CREATE INDEX release_tier_change_tenant_ts IF NOT EXISTS
     FOR (c:ReleaseTierChange) ON (c.tenantId, c.ts)`,
  ],
};
