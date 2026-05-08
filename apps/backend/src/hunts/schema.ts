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
  }
`;
