import type { Migration } from './types.js';

export const m006_threat_intel_schema: Migration = {
  id: '006_threat_intel_schema',
  description: 'IntrusionSet (threat actor) + AttackPattern (TTP) — global, sourced from MITRE ATT&CK',
  up: [
    `CREATE CONSTRAINT intrusion_set_id_unique IF NOT EXISTS
     FOR (i:IntrusionSet) REQUIRE i.id IS UNIQUE`,

    `CREATE CONSTRAINT attack_pattern_id_unique IF NOT EXISTS
     FOR (a:AttackPattern) REQUIRE a.id IS UNIQUE`,

    `CREATE INDEX intrusion_set_name IF NOT EXISTS
     FOR (i:IntrusionSet) ON (i.name)`,

    `CREATE INDEX attack_pattern_name IF NOT EXISTS
     FOR (a:AttackPattern) ON (a.name)`,

    `CREATE FULLTEXT INDEX intrusion_set_search IF NOT EXISTS
     FOR (i:IntrusionSet) ON EACH [i.id, i.name, i.description]`,

    `CREATE FULLTEXT INDEX attack_pattern_search IF NOT EXISTS
     FOR (a:AttackPattern) ON EACH [a.id, a.name, a.description]`,
  ],
};
