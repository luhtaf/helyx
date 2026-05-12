export const attackPatternTypeDefs = /* GraphQL */ `
  type AttackPatternDetail {
    id: ID!
    name: String!
    description: String
    url: String
    platforms: [String!]!
    detection: String
    dataSources: [String!]!
    detections: [DataComponentRef!]!
    killChainPhases: [String!]!
    isSubtechnique: Boolean!
    threatActors(limit: Int = 25): [ThreatActorOnTechnique!]!
  }

  type DataComponentRef {
    id: ID!
    name: String!
    description: String
    dataSourceName: String!
  }

  type ThreatActorOnTechnique {
    id: ID!
    name: String!
    techniqueCount: Int!
  }

  """Lightweight ref for autocomplete (guess-actor TTP picker, etc.).
  No edges, no platforms — just the minimum to render a dropdown row."""
  type AttackPatternSearchHit {
    id: ID!
    name: String!
    isSubtechnique: Boolean!
    """Parent T-code when isSubtechnique=true ('T1059.001' → 'T1059'),
    null otherwise. Lets the FE indent / group sub-techniques visually."""
    parentTechniqueId: String
  }

  extend type Query {
    attackPattern(id: ID!): AttackPatternDetail
    """Fuzzy search for autocomplete pickers. Matches on T-code prefix
    OR case-insensitive name CONTAINS. Returns up to limit (max 25)
    sorted by id ASC. Empty / 1-char query returns []."""
    searchAttackPatterns(q: String!, limit: Int = 10): [AttackPatternSearchHit!]!
  }
`;
