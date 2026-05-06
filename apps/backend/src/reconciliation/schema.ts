export const reconciliationTypeDefs = /* GraphQL */ `
  enum ReconciliationStatus { PENDING APPROVED REJECTED NEEDS_REVIEW }

  type RawStakeholder {
    id: ID!
    source: String!
    rawName: String!
    rawSektor: String
    hitCount: Int!
    targetCount: Int!
    lastSeen: String!
    status: ReconciliationStatus!
    confidence: Float
    resolvedTo: Stakeholder
    resolvedAt: String
    suggestions: [StakeholderSuggestion!]!
  }

  type StakeholderSuggestion {
    stakeholder: Stakeholder!
    confidence: Float!
    reason: String!
  }

  type RawStakeholderCounts {
    pending: Int!
    approved: Int!
    rejected: Int!
    needsReview: Int!
  }

  extend type Query {
    rawStakeholders(status: ReconciliationStatus = PENDING, first: Int = 50): [RawStakeholder!]!
    rawStakeholder(id: ID!): RawStakeholder
    rawStakeholderCounts: RawStakeholderCounts!
  }

  extend type Mutation {
    resolveRawStakeholder(rawId: ID!, stakeholderId: ID!): RawStakeholder!
    bulkResolveRawStakeholders(rawIds: [ID!]!, stakeholderId: ID!): Int!
    createStakeholderFromRaw(rawId: ID!, input: StakeholderInput!): RawStakeholder!
    rejectRawStakeholder(rawId: ID!, reason: String): RawStakeholder!
    recomputeSuggestions(rawId: ID): Int!
  }
`;
