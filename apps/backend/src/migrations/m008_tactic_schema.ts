import type { Migration } from './types.js';

export const m008_tactic_schema: Migration = {
  id: '008_tactic_schema',
  description: 'Tactic node + (AttackPattern)-[:OF_TACTIC]->(Tactic) — global, sourced from MITRE ATT&CK',
  up: [
    `CREATE CONSTRAINT tactic_id_unique IF NOT EXISTS
     FOR (t:Tactic) REQUIRE t.id IS UNIQUE`,
    `CREATE CONSTRAINT tactic_shortname_unique IF NOT EXISTS
     FOR (t:Tactic) REQUIRE t.shortname IS UNIQUE`,
    `CREATE INDEX tactic_order IF NOT EXISTS
     FOR (t:Tactic) ON (t.ordering)`,
  ],
};
