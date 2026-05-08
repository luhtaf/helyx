import type { Migration } from './types.js';

export const m015_stakeholder_asset_link: Migration = {
  id: '015_stakeholder_asset_link',
  description: 'Asset.source + Asset.scanName trace fields + index for Stakeholder OWNS Asset traversal',
  up: [
    // Index on source so we can filter "all spiderfoot-ingested assets" cheaply
    `CREATE INDEX asset_source IF NOT EXISTS
     FOR (a:Asset) ON (a.source)`,
    // Composite for "this stakeholder's assets" — rel is :OWNS, but we keep
    // tenantId on Asset and scope by it; this index speeds the join leg.
    `CREATE INDEX asset_tenant_kind IF NOT EXISTS
     FOR (a:Asset) ON (a.tenantId, a.kind)`,
    // No new node label — we reuse :Stakeholder and :Asset, and add the
    // :OWNS edge purely at write time. No constraint on the edge itself
    // (Neo4j can't constrain rel uniqueness on (start,end) directly without
    // the rel-key feature; idempotency comes from MERGE in repos).
  ],
};
