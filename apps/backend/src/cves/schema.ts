export const cveTypeDefs = /* GraphQL */ `
  type CveDetail {
    id: ID!
    description: String
    vulnStatus: String
    sourceIdentifier: String
    publishedAt: String
    lastModifiedAt: String
    cvssV31BaseScore: Float
    cvssV31BaseSeverity: String
    cvssV31VectorString: String
    cvssV2BaseScore: Float
    cvssV2BaseSeverity: String
    cvssV2VectorString: String

    weaknesses: [CweRef!]!
    references: [ReferenceRef!]!
    affectedAssets(page: Int = 1, perPage: Int = 25): AffectedAssetPage!
  }

  type CweRef {
    id: ID!
    name: String
  }

  type ReferenceRef {
    url: String!
    source: String
    tags: [String!]!
  }

  type AffectedAsset {
    asset: Asset!
    componentPurl: String
    matchMode: AffectedMatchMode!
  }

  enum AffectedMatchMode {
    EXACT
    BEAST
  }

  type AffectedAssetPage {
    items: [AffectedAsset!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  type TenantCveRow {
    cveId: ID!
    description: String
    severity: String
    baseScore: Float
    publishedAt: String
    affectedAssetCount: Int!
  }

  type TenantCvePage {
    items: [TenantCveRow!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  input TenantCveFilterInput {
    severity: String
    search: String
    mode: MatchMode = EXACT
  }

  extend type Query {
    cve(id: ID!): CveDetail
    tenantCves(filter: TenantCveFilterInput, page: Int = 1, perPage: Int = 25): TenantCvePage!
  }
`;
