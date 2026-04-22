import type { Migration } from './types.js';

export const m007_hunt_schema: Migration = {
  id: '007_hunt_schema',
  description: 'Hunt — tenant-scoped intersection of selected ThreatActors × selected Assets',
  up: [
    `CREATE CONSTRAINT hunt_id_unique IF NOT EXISTS
     FOR (h:Hunt) REQUIRE h.id IS UNIQUE`,

    `CREATE INDEX hunt_tenant IF NOT EXISTS
     FOR (h:Hunt) ON (h.tenantId)`,

    `CREATE INDEX hunt_created_at IF NOT EXISTS
     FOR (h:Hunt) ON (h.createdAt)`,

    `CREATE FULLTEXT INDEX hunt_search IF NOT EXISTS
     FOR (h:Hunt) ON EACH [h.name]`,
  ],
};
