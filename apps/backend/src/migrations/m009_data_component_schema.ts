import type { Migration } from './types.js';

export const m009_data_component_schema: Migration = {
  id: '009_data_component_schema',
  description: 'DataSource + DataComponent — MITRE ATT&CK detection graph',
  up: [
    `CREATE CONSTRAINT data_source_id_unique IF NOT EXISTS
     FOR (d:DataSource) REQUIRE d.id IS UNIQUE`,
    `CREATE CONSTRAINT data_component_id_unique IF NOT EXISTS
     FOR (d:DataComponent) REQUIRE d.id IS UNIQUE`,
    `CREATE INDEX data_source_name IF NOT EXISTS
     FOR (d:DataSource) ON (d.name)`,
    `CREATE INDEX data_component_name IF NOT EXISTS
     FOR (d:DataComponent) ON (d.name)`,
  ],
};
