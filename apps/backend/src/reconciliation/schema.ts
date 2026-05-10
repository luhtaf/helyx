import { MATCH_REASONS, RECONCILIATION_STATUSES } from './kinds.js';

export const reconciliationTypeDefs = /* GraphQL */ `
  enum ReconciliationStatus { ${RECONCILIATION_STATUSES.join(' ')} }
  """Why the fuzzy matcher chose this stakeholder. Each value corresponds
  to a distinct matcher rule in fuzzy.ts."""
  enum MatchReason { ${MATCH_REASONS.join(' ')} }

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
    reason: MatchReason!
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
