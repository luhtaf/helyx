export const huntTypeDefs = /* GraphQL */ `
  enum HuntStatus {
    ACTIVE
    ARCHIVED
  }

  type Hunt {
    id: ID!
    name: String!
    status: HuntStatus!
    createdAt: String!
    updatedAt: String!
    targetActorCount: Int!
    scopedAssetCount: Int!
    targetActors: [HuntActorRef!]!
    scopedAssets: [HuntAssetRef!]!
    findings: HuntFindings!
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

  extend type Query {
    hunt(id: ID!): Hunt
    hunts(page: Int = 1, perPage: Int = 25): HuntPage!
  }

  extend type Mutation {
    createHunt(input: CreateHuntInput!): Hunt!
    deleteHunt(id: ID!): Boolean!
  }
`;
