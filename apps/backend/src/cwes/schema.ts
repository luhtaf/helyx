export const cweTypeDefs = /* GraphQL */ `
  type CweDetail {
    id: ID!
    name: String
    cves(page: Int = 1, perPage: Int = 25): CweCvePage!
  }

  type CweCvePage {
    items: [CweRelatedCveRow!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  type CweRelatedCveRow {
    cveId: ID!
    description: String
    severity: String
    baseScore: Float
    publishedAt: String
  }

  extend type Query {
    cwe(id: ID!): CweDetail
  }
`;
