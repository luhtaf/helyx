export const threatActorTypeDefs = /* GraphQL */ `
  type ThreatActor {
    id: ID!
    name: String!
    description: String
    aliases: [String!]!
    url: String
    createdAt: String
    modifiedAt: String
    techniqueCount: Int!
    techniques: [AttackPatternRef!]!
  }

  type AttackPatternRef {
    id: ID!
    name: String!
    description: String
    url: String
    platforms: [String!]!
    killChainPhases: [String!]!
    isSubtechnique: Boolean!
  }

  type ThreatActorPage {
    items: [ThreatActor!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  extend type Query {
    threatActor(id: ID!): ThreatActor
    threatActors(search: String, page: Int = 1, perPage: Int = 25): ThreatActorPage!
  }
`;
