import type { Migration } from './types.js';

export const m010_detection_strategy_schema: Migration = {
  id: '010_detection_strategy_schema',
  description: 'DetectionStrategy — bridge layer between detects relationship and DataComponent',
  up: [
    `CREATE CONSTRAINT detection_strategy_id_unique IF NOT EXISTS
     FOR (s:DetectionStrategy) REQUIRE s.id IS UNIQUE`,
    `CREATE INDEX detection_strategy_name IF NOT EXISTS
     FOR (s:DetectionStrategy) ON (s.name)`,
  ],
};
