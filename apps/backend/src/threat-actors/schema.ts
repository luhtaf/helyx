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

  """C — Guess threat actor by selected TTPs. Operator picks several
  technique IDs, gets a ranked list of actors weighted by overlap.

  Score = Jaccard index = |matched ∩ actor.uses| / |matched ∪ actor.uses|.
  Range 0.0 (no overlap) to 1.0 (perfect set match). Symmetric — equally
  penalises actors who use only some of your TTPs AND actors who use
  many TTPs you didn't select. Tie-break by absolute matchedCount."""
  type ActorMatch {
    actor: ThreatActor!
    """How many of the input TTPs this actor uses."""
    matchedCount: Int!
    """Total TTPs this actor uses (denominator context for the operator)."""
    actorTtpCount: Int!
    """Jaccard score, range 0.0 - 1.0."""
    score: Float!
    """The matched technique IDs (subset of input). For chip rendering."""
    matchedTechniqueIds: [String!]!
  }

  extend type Query {
    threatActor(id: ID!): ThreatActor
    threatActors(search: String, page: Int = 1, perPage: Int = 25): ThreatActorPage!
    """C — Rank threat actors by overlap with the supplied TTP set.
    Empty input returns []. Limit caps result rows (default 20, max 50)."""
    guessActorByTtps(techniqueIds: [String!]!, limit: Int = 20): [ActorMatch!]!
  }
`;
