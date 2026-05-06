import type { Migration } from './types.js';

export const m013_ca_case_schema: Migration = {
  id: '013_ca_case_schema',
  description: 'Compromise Assessment — Case container + 11 typed Artifact nodes (multi-label pattern)',
  up: [
    // Case
    `CREATE CONSTRAINT case_id_unique IF NOT EXISTS
     FOR (c:Case) REQUIRE c.id IS UNIQUE`,
    `CREATE CONSTRAINT case_report_no_unique IF NOT EXISTS
     FOR (c:Case) REQUIRE (c.tenantId, c.reportNo) IS UNIQUE`,
    `CREATE INDEX case_tenant IF NOT EXISTS
     FOR (c:Case) ON (c.tenantId)`,
    `CREATE INDEX case_status IF NOT EXISTS
     FOR (c:Case) ON (c.status)`,
    `CREATE INDEX case_deployed_at IF NOT EXISTS
     FOR (c:Case) ON (c.deployedAt)`,
    `CREATE FULLTEXT INDEX case_search IF NOT EXISTS
     FOR (c:Case) ON EACH [c.reportNo, c.title, c.trigger, c.summary]`,

    // Artifact (base label, applied to all 11 types via multi-label)
    `CREATE CONSTRAINT artifact_id_unique IF NOT EXISTS
     FOR (a:Artifact) REQUIRE a.id IS UNIQUE`,
    `CREATE INDEX artifact_case IF NOT EXISTS
     FOR (a:Artifact) ON (a.caseId)`,
    `CREATE INDEX artifact_observed_at IF NOT EXISTS
     FOR (a:Artifact) ON (a.observedAt)`,
    `CREATE INDEX artifact_tenant IF NOT EXISTS
     FOR (a:Artifact) ON (a.tenantId)`,

    // Per-type indexes (selective — hot lookup paths only)
    `CREATE INDEX artifact_ioc_value IF NOT EXISTS
     FOR (a:Ioc) ON (a.value)`,
    `CREATE INDEX artifact_file_sha256 IF NOT EXISTS
     FOR (a:File) ON (a.sha256)`,
    `CREATE INDEX artifact_process_name IF NOT EXISTS
     FOR (a:Process) ON (a.name)`,
    `CREATE INDEX artifact_detection_hit_rule_id IF NOT EXISTS
     FOR (a:DetectionHit) ON (a.ruleId)`,
  ],
};
