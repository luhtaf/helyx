export const attackPatternTypeDefs = /* GraphQL */ `
  type AttackPatternDetail {
    id: ID!
    name: String!
    description: String
    url: String
    platforms: [String!]!
    killChainPhases: [String!]!
    isSubtechnique: Boolean!
    threatActors(limit: Int = 25): [ThreatActorOnTechnique!]!
  }

  type ThreatActorOnTechnique {
    id: ID!
    name: String!
    techniqueCount: Int!
  }

  extend type Query {
    attackPattern(id: ID!): AttackPatternDetail
  }
`;
