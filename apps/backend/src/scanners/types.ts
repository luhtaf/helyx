// Scanner pipeline types — shared by repo, REST ingest, GraphQL.
// AssetKind enum is mirrored from assets/ to keep this module
// self-contained for ingest validation (no cross-module imports
// pulling unintended deps into the REST handler).

export const SCANNER_STATUSES = ['active', 'disabled', 'expired'] as const;
export type ScannerStatus = (typeof SCANNER_STATUSES)[number];

export const SCAN_REPORT_STATUSES = ['pending', 'reviewed', 'rejected'] as const;
export type ScanReportStatus = (typeof SCAN_REPORT_STATUSES)[number];

export const DISCOVERED_STATUSES = [
  'pending',
  'merged_to_existing',
  'created_new',
  'rejected',
] as const;
export type DiscoveredStatus = (typeof DISCOVERED_STATUSES)[number];

export const SCAN_FORMATS = [
  'helyx-discovery-v1', // native, designed for inventory inbox
  'trivy-rootfs',       // future: trivy SBOM root scan
  'cyclonedx',          // future: SBOM
] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];

export interface Scanner {
  id: string;
  tenantId: string;
  label: string;
  scope: string;
  /** sha256 hex of plaintext token. Plaintext shown ONCE on create. */
  tokenHash: string;
  /** First 8 chars of plaintext for display (e.g. "scn_a8f3"). */
  tokenPrefix: string;
  status: ScannerStatus;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  lastIngestAt: string | null;
  totalIngests: number;
}

export interface ScanReport {
  id: string;
  tenantId: string;
  scannerId: string;
  scannerLabel: string | null;
  ts: string;
  source: 'token' | 'manual';
  format: ScanFormat;
  payloadHash: string;
  payloadSize: number;
  status: ScanReportStatus;
  itemCount: number;
  reviewerUserId: string | null;
  reviewedAt: string | null;
}

export interface DiscoveredAsset {
  id: string;
  tenantId: string;
  reportId: string;
  kind: string; // AssetKind — keep as string here, validated at create
  name: string;
  hostname: string | null;
  ipAddresses: string[];
  parentDiscoveredId: string | null;
  status: DiscoveredStatus;
  matchedAssetId: string | null;
  createdAt: string;
}

// helyx-discovery-v1 payload shape (operator-side scanner emits this).
// Each item maps 1:1 to a DiscoveredAsset row.
export interface HelyxDiscoveryV1Payload {
  format: 'helyx-discovery-v1';
  items: Array<{
    kind: string;
    name: string;
    hostname?: string;
    ipAddresses?: string[];
    parentName?: string; // resolved to parentDiscoveredId at insert time
  }>;
}
