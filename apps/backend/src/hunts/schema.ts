export const huntTypeDefs = /* GraphQL */ `
  enum HuntStatus {
    ACTIVE
    ARCHIVED
  }

  enum HuntKind {
    STRUCTURED   # Legacy: ThreatActors × Assets (createHunt path)
    GRAPH        # Maltego canvas snapshot (saveGraphAsHunt path)
  }

  type Hunt {
    id: ID!
    name: String!
    kind: HuntKind!
    status: HuntStatus!
    """F1 — release tier (defaults 'internal' for legacy hunts)."""
    releaseTier: ReleaseTier!
    createdAt: String!
    updatedAt: String!
    targetActorCount: Int!
    scopedAssetCount: Int!
    targetActors: [HuntActorRef!]!
    scopedAssets: [HuntAssetRef!]!
    findings: HuntFindings!
    # Graph kind only — JSON-serialized {nodes, edges, viewport}.
    # Null for STRUCTURED hunts.
    graphSnapshot: String
    # Optional seed entry that started the hunt (for breadcrumb).
    graphSeedType: String
    graphSeedId: ID
  }

  type HuntActorRef {
    id: ID!
    name: String!
    techniqueCount: Int!
  }

  type HuntAssetRef {
    id: ID!
    name: String!
    kind: AssetKind!
  }

  type HuntFindings {
    ttpCount: Int!
    cveCount: Int!
    topTtps(limit: Int = 12): [HuntTtpRow!]!
    topCves(limit: Int = 12): [HuntCveRow!]!
  }

  type HuntTtpRow {
    id: ID!
    name: String!
    killChainPhases: [String!]!
    actorCount: Int!
  }

  type HuntCveRow {
    cveId: ID!
    description: String
    severity: String
    baseScore: Float
    affectedAssetCount: Int!
  }

  type HuntPage {
    items: [Hunt!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  input CreateHuntInput {
    name: String!
    targetActorIds: [ID!]!
    scopedAssetIds: [ID!]!
  }

  input SaveGraphAsHuntInput {
    name: String!
    """JSON-serialized {nodes, edges, viewport} from cytoscape. Validated
    only for size + parseability; schema enforced by frontend."""
    snapshot: String!
    seedType: String
    seedId: ID
  }

  type SearchEntityResult {
    """Type of the entity: Stakeholder, Asset, CVE, Case."""
    type: String!
    id: ID!
    label: String!
    """Optional secondary line — slug, hostname, severity."""
    detail: String
  }

  extend type Query {
    hunt(id: ID!): Hunt
    hunts(page: Int = 1, perPage: Int = 25): HuntPage!
    """Cross-type entity search for graph canvas search-add. Tenant-scoped."""
    searchEntities(q: String!, first: Int = 10): [SearchEntityResult!]!
  }

  extend type Mutation {
    createHunt(input: CreateHuntInput!): Hunt!
    deleteHunt(id: ID!): Boolean!
    """Persist current graph state as a Hunt of kind GRAPH."""
    saveGraphAsHunt(input: SaveGraphAsHuntInput!): Hunt!
    """Update an existing GRAPH-kind Hunt's snapshot (auto-save path)."""
    updateHuntSnapshot(id: ID!, snapshot: String!): Hunt!
    """Walk a Hunt's nodes (Case → Artifact + AttackPattern), categorize
    IOCs/TTPs, run YARA/Suricata/Sigma generators, persist as
    :DetectionRule kind=GENERATED. Returns counters for what was created."""
    generateRulesFromHunt(huntId: ID!): GenerateRulesResult!
    """H2.2 — Pack already-generated rules from a Hunt into a downloadable
    zip with yara/, suricata/, sigma/ subdirs + manifest.json. Run
    generateRulesFromHunt first; this is a packaging layer, not a generator.
    Returns base64-encoded bytes (small payloads only — typical zip <50KB)."""
    packHuntRulesAsZip(huntId: ID!): PackedRulesZip!
    """H3 — Materialize a TTP-seed hunt. Counts first ('1,847 matches →
    refine'), then optional graph snapshot. Actor JOIN per Owner spec
    via actorId. Hard cap per type prevents silent data loss; UI must
    surface .capped=true."""
    materializeTtpHunt(input: TtpMaterializeInput!): TtpMaterializeResult!
    """F1b — Set release tier on a Hunt. Mirror of setRuleReleaseTier.
    Audit-logged via :ReleaseTierChange + AuditEvent. No-op same-tier."""
    setHuntReleaseTier(id: ID!, tier: ReleaseTier!): Hunt!
    """H5 — Pack approved rules from a Hunt as a STIX 2.1 Bundle.
    Only F2-approved + non-stale rules export. TLP marking-def is derived
    from Hunt.releaseTier (public/cross-agency/sectoral/internal →
    white/green/amber/red). Persists :StixExport for /exports/:id detail."""
    exportHuntAsStix(huntId: ID!): StixExportResult!
  }

  type StixExportResult {
    """Persistent :StixExport id — links to detail page (future H5.5)."""
    exportId: ID!
    filename: String!
    """Base64-encoded JSON bundle. Bundle is small (typically <50KB);
    larger payloads should move to a Content-Disposition REST path."""
    base64: String!
    bundleId: String!
    indicatorCount: Int!
    skippedUnapproved: Int!
    skippedStale: Int!
    """Computed TLP marking ('white' | 'green' | 'amber' | 'red'). Derived
    from Hunt.releaseTier — informational, the bundle already carries the
    OASIS marking-definition object_marking_refs."""
    tlp: String!
    """sha256 of bundle bytes — for downstream signature comparison."""
    contentHash: String!
    """F2 — Ed25519 detached signature (base64) over bundle bytes.
    Verifiers reproduce the bundle bytes and check signature against
    signerPublicKeyPem with crypto.verify(null, bytes, pubKey, sig)."""
    signature: String!
    """F2 — Algorithm constant ('ed25519'). Future-proofs result shape
    for when key-rotation supports alternate algorithms."""
    signatureAlgorithm: String!
    """F2 — id of the :CtiOrgKeypair used to sign this export."""
    signedByKeypairId: ID!
    """F2 — Signer public key (PEM, SPKI). Verifiers can use directly."""
    signerPublicKeyPem: String!
  }

  type GenerateRulesResult {
    yaraCount: Int!
    suricataCount: Int!
    sigmaCount: Int!
    skipped: [GenerateSkippedReason!]!
  }

  type GenerateSkippedReason {
    reason: String!
    count: Int!
  }

  type PackedRulesZip {
    filename: String!
    base64: String!
    ruleCount: Int!
    yaraCount: Int!
    suricataCount: Int!
    sigmaCount: Int!
  }

  input TtpMaterializeInput {
    """MITRE T-code, e.g. 'T1486'. Maps to AttackPattern.id."""
    techniqueId: String!
    """Optional Actor scope per Owner spec: 'TTP from Actor B'."""
    actorId: String
    """Optional refine — restrict to these stakeholders only."""
    stakeholderIds: [String!]
    """false = facets only (cheap, count-first UX). true = also return graph snapshot."""
    proceedToGraph: Boolean = false
    """Hard cap per entity type when proceedToGraph=true. Default 50; UI surfaces .capped."""
    capPerType: Int = 50
  }

  type TtpFacets {
    techniqueId: String!
    techniqueName: String
    actorCount: Int!
    stakeholderCount: Int!
    assetCount: Int!
    ruleCount: Int!
    artifactCount: Int!
    """Sum + 1 (for the seed AttackPattern node) — headline 'X matches'."""
    totalNodes: Int!
  }

  type TtpMaterializeResult {
    facets: TtpFacets!
    """JSON-encoded graphSnapshot when proceedToGraph=true; null otherwise."""
    graphSnapshot: String
    """True if any per-type collection hit capPerType — UI must surface."""
    capped: Boolean!
    cap: Int!
  }
`;
