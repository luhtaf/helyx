import type { Migration } from './types.js';

export const m005_drop_matches_cpe: Migration = {
  id: '005_drop_matches_cpe',
  description: 'Remove legacy MATCHES_CPE edges — match logic moved to query-time resolvers',
  up: [
    `MATCH ()-[r:MATCHES_CPE]->() DELETE r`,
  ],
};
