export const assetTypeDefs = /* GraphQL */ `
  enum AssetKind {
    HOST
    HYPERVISOR
    VM
    CONTAINER
    K8S_CLUSTER
    K8S_NODE
    K8S_POD
    IMAGE
    APPLICATION
  }

  """
  CVE-to-asset matching strategy. Wider modes catch more CVEs (incl. false positives).
  EXACT       — CPE-precise (vendor+product+exact version)
  MAJOR_MINOR — same vendor+product, version a.b.*  (matches all patches)
  MAJOR       — same vendor+product, version a.*.*  (matches all minors)
  BEAST       — same vendor+product, any version    (matches *.*.*)
  """
  enum MatchMode {
    EXACT
    MAJOR_MINOR
    MAJOR
    BEAST
  }

  type Asset {
    id: ID!
    kind: AssetKind!
    name: String!
    hostname: String
    ipAddresses: [String!]!
    parent: Asset
    children: [Asset!]!
    childCount: Int!
    components(limit: Int = 50): [SoftwareComponent!]!
    componentCount: Int!
    cves(mode: MatchMode = EXACT, limit: Int = 50): [CveMatch!]!
    cveCount(mode: MatchMode = EXACT): Int!
    createdAt: String!
    updatedAt: String!
  }

  type SoftwareComponent {
    id: ID!
    purl: String!
    name: String!
    version: String
    type: String
    cpeUri: String
  }

  type CveMatch {
    cveId: ID!
    description: String
    severity: String
    baseScore: Float
    publishedAt: String
    componentPurl: String!
    cpeUri: String!
    mode: MatchMode!
  }

  """
  PROMOTE_CHILDREN — children re-attach to the deleted node's parent (or become roots).
  CASCADE          — delete the node and its entire subtree.
  """
  enum DeleteMode {
    PROMOTE_CHILDREN
    CASCADE
  }

  type DeleteAssetResult {
    deleted: Boolean!
    deletedCount: Int!
    promotedCount: Int!
  }

  type SbomIngestResult {
    sbomId: ID!
    asset: Asset!
    componentCount: Int!
    componentsWithExplicitCpe: Int!
    productLinkCount: Int!
    skippedNoPurl: Int!
  }

  input CreateAssetInput {
    kind: AssetKind!
    name: String!
    hostname: String
    ipAddresses: [String!]
    parentId: ID
  }

  type AssetPage {
    items: [Asset!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  extend type Query {
    asset(id: ID!): Asset
    assets(kind: AssetKind, search: String, page: Int = 1, perPage: Int = 25): AssetPage!
    rootAssets(limit: Int = 100): [Asset!]!
  }

  extend type Mutation {
    createAsset(input: CreateAssetInput!): Asset!
    deleteAsset(id: ID!, mode: DeleteMode = PROMOTE_CHILDREN): DeleteAssetResult!
    ingestSbom(assetId: ID!, sbomJson: String!, sourceFilename: String): SbomIngestResult!
  }
`;
