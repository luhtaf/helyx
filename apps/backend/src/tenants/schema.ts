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

  type LogoutResult {
    ok: Boolean!
  }

  type RefreshResult {
    ok: Boolean!
  }

  extend type Query {
    me: User
    myOrganizations: [Organization!]!
    organization(slug: String!): Organization
  }

  type Mutation {
    register(email: String!, password: String!, displayName: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    logout: LogoutResult!
    refresh: RefreshResult!
    createOrganization(name: String!, slug: String!): Organization!
    """Invite an existing user (by email) into an org, or change their
    role if already a member. ADMIN+ in the target org."""
    addOrganizationMember(orgId: ID!, email: String!, role: OrgRole!): Membership!
    """Revoke a user's org membership. ADMIN+ in the target org. Refuses
    to remove the last OWNER or the caller themselves."""
    removeOrganizationMember(orgId: ID!, userId: ID!): Boolean!
  }
`;
