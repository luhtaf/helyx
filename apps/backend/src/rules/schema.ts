import { RULE_KINDS, RULE_STATUSES, RULE_SOURCES, encodeSource } from './kinds.js';

export const ruleTypeDefs = /* GraphQL */ `
  """Detection engine syntax — what FORMAT the rule is in. NOT a taxonomy
  of what the rule detects (those are :DETECTS edges to MITRE / OWASP /
  CWE nodes or tag prefixes like 'owasp.a01-…')."""
  enum RuleKind { ${RULE_KINDS.join(' ')} }
  enum RuleStatus { ${RULE_STATUSES.join(' ')} }
  enum RuleSource { ${RULE_SOURCES.map(encodeSource).join(' ')} }

  type DetectionRule {
    id: ID!
    kind: RuleKind!
    name: String!
    description: String
    content: String!
    tags: [String!]!
    source: RuleSource!
    sourceRef: String
    status: RuleStatus!
    createdAt: String!
    updatedAt: String!
    """Number of artifacts (IOCs) this rule was derived from. >0 means
    'indicator-style' rule (rule itself acts as IOC marker)."""
    derivedFromArtifactCount: Int!
    detectsTechniqueCount: Int!
    """Number of hunts that produced this rule via :GENERATED."""
    generatedByHuntCount: Int!
  }

  type DetectionRulePage {
    items: [DetectionRule!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  input RuleFilterInput {
    kind: RuleKind
    status: RuleStatus
    source: RuleSource
    tag: String
    search: String
  }

  input CreateRuleInput {
    kind: RuleKind!
    name: String!
    description: String
    content: String!
    tags: [String!]
    status: RuleStatus
    derivedFromArtifactIds: [ID!]
    detectsTechniqueIds: [ID!]
  }

  input UpdateRuleInput {
    name: String
    description: String
    content: String
    tags: [String!]
    status: RuleStatus
  }

  extend type Query {
    detectionRule(id: ID!): DetectionRule
    detectionRules(filter: RuleFilterInput, page: Int = 1, perPage: Int = 25): DetectionRulePage!
  }

  extend type Mutation {
    createDetectionRule(input: CreateRuleInput!): DetectionRule!
    updateDetectionRule(id: ID!, input: UpdateRuleInput!): DetectionRule!
    deleteDetectionRule(id: ID!): Boolean!
  }
`;
