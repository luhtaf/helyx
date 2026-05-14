import type { Migration } from './types.js';

// Scanner pipeline — operator workflow:
//   1. OWNER registers Scanner → gets one-time plaintext token
//   2. Scanner agent POSTs scan results to /api/v1/scanner/ingest
//      (Bearer token in Authorization)
//   3. Backend creates :ScanReport + N :DiscoveredAsset rows
//      (status=pending), audit chain
//   4. Operator reviews via Inventory Inbox — merge to existing
//      Asset, accept as new (creates real Asset), or reject
//
// Threat model:
//   - Token = SHA256 hashed at rest, plaintext shown ONCE at create
//   - Per-scanner rate limit (Redis SETEX) — separate change
//   - Optional expiresAt; cron flips status='expired' on reach
//   - Source IP allowlist per scanner — defer to follow-up
export const m026_scanner: Migration = {
  id: '026_scanner',
  description: 'Scanner agents + ScanReport + DiscoveredAsset for inventory ingest pipeline.',
  up: [
    // :Scanner — registered ingest agent
    `CREATE CONSTRAINT scanner_id_unique IF NOT EXISTS
     FOR (s:Scanner) REQUIRE s.id IS UNIQUE`,
    `CREATE INDEX scanner_tenant_status IF NOT EXISTS
     FOR (s:Scanner) ON (s.tenantId, s.status)`,
    `CREATE INDEX scanner_token_hash IF NOT EXISTS
     FOR (s:Scanner) ON (s.tokenHash)`,

    // :ScanReport — one row per ingest call
    `CREATE CONSTRAINT scan_report_id_unique IF NOT EXISTS
     FOR (r:ScanReport) REQUIRE r.id IS UNIQUE`,
    `CREATE INDEX scan_report_tenant_status IF NOT EXISTS
     FOR (r:ScanReport) ON (r.tenantId, r.status)`,
    `CREATE INDEX scan_report_scanner IF NOT EXISTS
     FOR (r:ScanReport) ON (r.scannerId)`,

    // :DiscoveredAsset — one row per item in payload, awaits review
    `CREATE CONSTRAINT discovered_asset_id_unique IF NOT EXISTS
     FOR (d:DiscoveredAsset) REQUIRE d.id IS UNIQUE`,
    `CREATE INDEX discovered_asset_tenant_status IF NOT EXISTS
     FOR (d:DiscoveredAsset) ON (d.tenantId, d.status)`,
    `CREATE INDEX discovered_asset_report IF NOT EXISTS
     FOR (d:DiscoveredAsset) ON (d.reportId)`,
  ],
};
