export const oidcTypeDefs = /* GraphQL */ `
  "Instance-global OIDC SSO config (admin panel). Secret never returned."
  type OidcConfig {
    enabled: Boolean!
    issuer: String!
    clientId: String!
    redirectUri: String!
    postLoginRedirect: String!
    scopes: String!
    "True when a sealed client secret is stored — never the value."
    hasClientSecret: Boolean!
    updatedAt: String
  }

  input OidcConfigInput {
    issuer: String!
    clientId: String!
    "Omit or leave blank to keep the existing sealed secret."
    clientSecret: String
    redirectUri: String!
    postLoginRedirect: String!
    scopes: String!
  }

  extend type Query {
    "Current OIDC SSO config (no secret). OWNER role."
    oidcConfig: OidcConfig!
  }

  extend type Mutation {
    "Upsert OIDC config fields (does not toggle enabled). OWNER role."
    setOidcConfig(input: OidcConfigInput!): OidcConfig!
    "Enable/disable SSO. Refuses to enable an incomplete config. OWNER."
    setOidcEnabled(enabled: Boolean!): OidcConfig!
  }
`;
