import type { Migration } from './types.js';

// F3a — RedactionProfile per tenant. Operator-controlled field-mask
// applied to STIX bundles before signing/exporting. Three builtin
// profiles seeded lazily by the repo on first list (per-tenant — can't
// seed in a migration since orgs onboard later).
//
// Field policies (boolean flags, default = include):
//   - includeRuleNames        : Indicator.name
//   - includeRuleDescriptions : Indicator.description
//   - includeRuleTags         : Indicator.labels
//   - includeOrgIdentity      : Identity object + created_by_ref refs
//
// Hunt gains an optional redactionProfileId — exporter resolves
// hunt → profile → mask. NULL profile = no masking (full).
export const m022_redaction_profile: Migration = {
  id: '022_redaction_profile',
  description: 'F3a — RedactionProfile schema + per-Hunt selection.',
  up: [
    `CREATE CONSTRAINT redaction_profile_id_unique IF NOT EXISTS
     FOR (p:RedactionProfile) REQUIRE p.id IS UNIQUE`,

    // (tenantId, slug) is the lookup key for "is the 'minimal' builtin
    // present for this tenant?". Composite uniqueness in Neo4j is via
    // node-key; we use a regular index + repo-level dedupe (slugs are
    // operator-immutable for builtins, generated UUIDs for custom).
    `CREATE INDEX redaction_profile_tenant_slug IF NOT EXISTS
     FOR (p:RedactionProfile) ON (p.tenantId, p.slug)`,

    // Backfill: existing hunts have no redactionProfileId — exporter
    // treats null as 'no redaction' (= full bundle, current behavior).
    // No SET needed; null property is the default.
  ],
};
