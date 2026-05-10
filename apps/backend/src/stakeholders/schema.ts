import { SENSOR_STACKS, SENSOR_STATUSES, STAKEHOLDER_STATUSES } from './kinds.js';

export const stakeholderTypeDefs = /* GraphQL */ `
  enum SensorStack       { ${SENSOR_STACKS.join(' ')} }
  enum SensorStatus      { ${SENSOR_STATUSES.join(' ')} }
  enum StakeholderStatus { ${STAKEHOLDER_STATUSES.join(' ')} }

  type Sektor {
    id: ID!
    slug: String!
    name: String!
    displayOrder: Int!
    stakeholderCount: Int!
  }

  type SensorDeploymentSummary {
    stack: SensorStack
    status: SensorStatus
    agentCount: Int
    deployedAt: String
    notes: String
  }

  type Stakeholder {
    id: ID!
    slug: String!
    name: String!
    aliases: [String!]!
    city: String
    coords: [Float!]
    notes: String
    status: StakeholderStatus!
    sektor: Sektor
    sensor: SensorDeploymentSummary!
    createdAt: String!
    updatedAt: String!
  }

  input StakeholderInput {
    slug: String!
    name: String!
    aliases: [String!]
    city: String
    coords: [Float!]
    notes: String
    sektorId: ID
  }

  input StakeholderUpdateInput {
    name: String
    aliases: [String!]
    city: String
    coords: [Float!]
    notes: String
    sektorId: ID
  }

  input SensorInput {
    stack: SensorStack
    status: SensorStatus
    agentCount: Int
    deployedAt: String
    notes: String
  }

  extend type Query {
    sektors: [Sektor!]!
    stakeholders(sektorId: ID, status: StakeholderStatus, search: String, first: Int = 50): [Stakeholder!]!
    stakeholder(id: ID!): Stakeholder
    stakeholderBySlug(slug: String!): Stakeholder
  }

  extend type Mutation {
    createStakeholder(input: StakeholderInput!): Stakeholder!
    updateStakeholder(id: ID!, input: StakeholderUpdateInput!): Stakeholder!
    archiveStakeholder(id: ID!): Stakeholder!
    setStakeholderSensor(id: ID!, input: SensorInput!): Stakeholder!
  }
`;
