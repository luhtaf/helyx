// Scanner pipeline GraphQL surface — operator/admin facing.
// Listing is ANALYST. Token-issuing mutations are OWNER (sensitive).
// Inventory inbox actions are ANALYST (review queue throughput).
export const scannerTypeDefs = /* GraphQL */ `
  enum ScannerStatus { active disabled expired }
  enum ScanReportStatus { pending reviewed rejected }
  enum DiscoveredStatus { pending merged_to_existing created_new rejected }
  enum ScanFormat {
    """Native helyx-discovery v1 — flat items[] with optional parentName."""
    helyx_discovery_v1
  }
  enum ScanSource { token manual }

  type Scanner {
    id: ID!
    label: String!
    scope: String!
    """Display-only — first 12 chars of plaintext token (e.g. 'scn_a8f3...')."""
    tokenPrefix: String!
    status: ScannerStatus!
    createdByUserId: ID!
    createdAt: String!
    expiresAt: String
    lastSeenAt: String
    lastIngestAt: String
    totalIngests: Int!
  }

  type ScannerCreated {
    scanner: Scanner!
    """Plaintext token. Returned ONCE on create + rotate. Operator must
    capture immediately; never retrievable again."""
    plaintextToken: String!
  }

  type ScanReport {
    id: ID!
    scannerId: ID!
    scannerLabel: String
    ts: String!
    source: ScanSource!
    format: String!
    payloadHash: String!
    payloadSize: Int!
    status: ScanReportStatus!
    itemCount: Int!
    reviewerUserId: ID
    reviewedAt: String
  }

  type DiscoveredAsset {
    id: ID!
    reportId: ID!
    kind: String!
    name: String!
    hostname: String
    ipAddresses: [String!]!
    parentDiscoveredId: ID
    status: DiscoveredStatus!
    matchedAssetId: ID
    createdAt: String!
  }

  input CreateScannerInput {
    label: String!
    scope: String!
    """Optional ISO timestamp; null = no expiry."""
    expiresAt: String
  }

  input ScanReportFilter {
    status: ScanReportStatus
  }

  extend type Query {
    """All scanners for the active org. ANALYST role."""
    scanners: [Scanner!]!
    """Scan reports inbox (newest first, capped 100). ANALYST role."""
    scanReports(filter: ScanReportFilter, limit: Int = 50): [ScanReport!]!
    """One report's discovered items (for the inbox detail view). ANALYST role."""
    discoveredAssetsForReport(reportId: ID!): [DiscoveredAsset!]!
  }

  type ManualUploadResult {
    reportId: ID!
    itemsAccepted: Int!
  }

  extend type Mutation {
    """Register a new scanner. Returns the plaintext token ONCE.
    OWNER role."""
    createScanner(input: CreateScannerInput!): ScannerCreated!

    """Operator-driven scan upload — same path as scanner agent ingest
    but no token. Lands in inventory inbox with source='manual'.
    payloadJson must be a serialized helyx-discovery-v1 envelope.
    ANALYST role."""
    uploadManualScanReport(payloadJson: String!): ManualUploadResult!
    """Mint a fresh token for an existing scanner. Returns plaintext
    ONCE. OWNER role."""
    rotateScannerToken(id: ID!): ScannerCreated!
    disableScanner(id: ID!): Scanner!
    enableScanner(id: ID!): Scanner!

    """Mark a discovered asset as merged to an existing one.
    Operator confirms 'this is the same machine'. ANALYST role."""
    mergeDiscoveredToExisting(discoveredId: ID!, assetId: ID!): DiscoveredAsset!
    """Create a real Asset from a discovered row. ANALYST role.
    Returns the new asset id via the discovered row."""
    acceptDiscoveredAsNew(discoveredId: ID!): DiscoveredAsset!
    """Reject a discovered row (false positive, off-scope). Optional
    reason. ANALYST role."""
    rejectDiscovered(discoveredId: ID!, reason: String): DiscoveredAsset!
  }
`;
