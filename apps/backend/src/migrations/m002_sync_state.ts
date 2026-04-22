import type { Migration } from './types.js';

export const m002_sync_state: Migration = {
  id: '002_sync_state',
  description: 'Sync-state tracking node for external data sources (NVD, OTX, etc.)',
  up: [
    `CREATE CONSTRAINT sync_state_source_unique IF NOT EXISTS
     FOR (s:_SyncState) REQUIRE s.source IS UNIQUE`,
  ],
};
