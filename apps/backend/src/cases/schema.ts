import { CASE_STATUSES, CASE_VERDICTS } from './kinds.js';

export const caseTypeDefs = /* GraphQL */ `
  enum CaseStatus  { ${CASE_STATUSES.join(' ')} }
  enum CaseVerdict { ${CASE_VERDICTS.join(' ')} }

  type Case {
    id: ID!
    reportNo: String!
    title: String
    trigger: String
    summary: String
    status: CaseStatus!
    verdict: CaseVerdict
    deployedAt: String!
    closedAt: String
    stakeholder: Stakeholder!
    lead: User
    artifactCount: Int!
    artifactsByType: ArtifactCounts!
    findings(limit: Int = 6): [Artifact!]!
    timeline(limit: Int = 100): [Artifact!]!
    artifacts(type: ArtifactType, severity: Severity, limit: Int = 50, offset: Int = 0): [Artifact!]!
    createdAt: String!
    updatedAt: String!
  }

  type ArtifactCounts {
    ioc: Int!
    file: Int!
    process: Int!
    network: Int!
    registry: Int!
    persistence: Int!
    account: Int!
    logFinding: Int!
    memory: Int!
    detectionHit: Int!
    note: Int!
  }

  input CaseInput {
    reportNo: String!
    title: String
    trigger: String
    summary: String
    stakeholderId: ID!
    leadUserId: ID
    deployedAt: String!
    status: CaseStatus
  }

  input CaseUpdateInput {
    title: String
    trigger: String
    summary: String
    status: CaseStatus
    leadUserId: ID
  }

  extend type Query {
    cases(stakeholderId: ID, status: [CaseStatus!], search: String, first: Int = 50, offset: Int = 0): [Case!]!
    case(id: ID!): Case
    caseByReportNo(reportNo: String!): Case
  }

  extend type Mutation {
    createCase(input: CaseInput!): Case!
    updateCase(id: ID!, input: CaseUpdateInput!): Case!
    closeCase(id: ID!, verdict: CaseVerdict!): Case!
    archiveCase(id: ID!): Case!
  }
`;
