export const dashboardTypeDefs = /* GraphQL */ `
  type AssetKindCount {
    kind: AssetKind!
    count: Int!
  }

  type SeverityCount {
    severity: String
    count: Int!
  }

  type TenantCve {
    cveId: ID!
    severity: String
    baseScore: Float
    publishedAt: String
    affectedAssetCount: Int!
  }

  type TenantStats {
    assetCount: Int!
    assetsByKind: [AssetKindCount!]!
    componentCount: Int!
    cveCount(mode: MatchMode = EXACT): Int!
    cveCountsBySeverity(mode: MatchMode = EXACT): [SeverityCount!]!
    topCves(mode: MatchMode = EXACT, limit: Int = 5): [TenantCve!]!
    recentCves(mode: MatchMode = EXACT, limit: Int = 5): [TenantCve!]!
  }

  extend type Query {
    tenantStats: TenantStats!
  }
`;
