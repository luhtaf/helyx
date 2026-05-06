export const tacticTypeDefs = /* GraphQL */ `
  type TacticDetail {
    id: ID!
    name: String!
    shortname: String!
    description: String
    url: String
    ordering: Int!
    techniqueCount: Int!
    techniques: [TacticTechniqueDetail!]!
    topActors(limit: Int = 25): [TacticActorDetail!]!
  }

  type TacticTechniqueDetail {
    id: ID!
    name: String!
    description: String
    isSubtechnique: Boolean!
    platforms: [String!]!
    killChainPhases: [String!]!
  }

  type TacticActorDetail {
    id: ID!
    name: String!
    techniqueCount: Int!
    techniquesInTacticCount: Int!
  }

  type MatrixTechniqueRow {
    id: ID!
    name: String!
    isSubtechnique: Boolean!
    parentTechniqueId: ID
  }

  type MatrixColumn {
    tactic: TacticDetail!
    techniques: [MatrixTechniqueRow!]!
  }

  input MatrixFilter {
    platform: String
    search: String
  }

  extend type Query {
    tactics: [TacticDetail!]!
    matrix(filter: MatrixFilter): [MatrixColumn!]!
    tactic(id: ID!): TacticDetail
  }
`;
