import type { Migration } from './types.js';

export const m016_detection_rule_schema: Migration = {
  id: '016_detection_rule_schema',
  description: 'DetectionRule — first-class entity for YARA/Suricata/Sigma/OWASP/Custom rules. Tenant-scoped. Standalone OR derived from Artifact/IOC.',
  up: [
    `CREATE CONSTRAINT detection_rule_id_unique IF NOT EXISTS
     FOR (r:DetectionRule) REQUIRE r.id IS UNIQUE`,

    `CREATE INDEX detection_rule_tenant IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.tenantId)`,

    `CREATE INDEX detection_rule_kind IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.kind)`,

    `CREATE INDEX detection_rule_source IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.source)`,

    `CREATE INDEX detection_rule_status IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.status)`,

    // Composite for common "list active rules in this tenant by kind"
    `CREATE INDEX detection_rule_tenant_kind IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.tenantId, r.kind)`,

    // External provenance — sourceRef carries the original ID from
    // SigmaHQ/OTX/STIX bundle for de-dup on import.
    `CREATE INDEX detection_rule_source_ref IF NOT EXISTS
     FOR (r:DetectionRule) ON (r.sourceRef)`,

    // Fulltext for the /rules search bar — hits name + description + tags.
    `CREATE FULLTEXT INDEX detection_rule_search IF NOT EXISTS
     FOR (r:DetectionRule) ON EACH [r.name, r.description]`,
  ],
};
