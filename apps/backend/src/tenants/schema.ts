export const tenantTypeDefs = /* GraphQL */ `
  enum OrgRole {
    OWNER
    ADMIN
    ANALYST
    VIEWER
  }

  type User {
    id: ID!
    email: String!
    displayName: String!
  }

  type Organization {
    id: ID!
    name: String!
    slug: String!
    createdAt: String!
    myRole: OrgRole
    members: [Membership!]!
  }

  type Membership {
    user: User!
    role: OrgRole!
    joinedAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  extend type Query {
    me: User
    myOrganizations: [Organization!]!
    organization(slug: String!): Organization
  }

  type Mutation {
    register(email: String!, password: String!, displayName: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    createOrganization(name: String!, slug: String!): Organization!
    addOrganizationMember(orgId: ID!, email: String!, role: OrgRole!): Membership!
  }
`;
