// F3a — operator surface for RedactionProfile.
// Listing is ANALYST (so non-owners can see what masking is in effect
// per hunt). setHuntRedactionProfile is ANALYST too — assigning a
// profile is a per-hunt operational decision, not a global policy.
// Custom profile creation is OWNER only (lands in F3a follow-up).
export const ctiRedactionTypeDefs = /* GraphQL */ `
  type RedactionProfile {
    id: ID!
    slug: String!
    name: String!
    description: String!
    builtin: Boolean!
    """Indicator.name field — operator-authored rule title."""
    includeRuleNames: Boolean!
    """Indicator.description — operator notes (most sensitive)."""
    includeRuleDescriptions: Boolean!
    """Indicator.labels — tags can leak adversary names + internal codenames."""
    includeRuleTags: Boolean!
    """Identity object + every created_by_ref (origin attribution)."""
    includeOrgIdentity: Boolean!
    createdAt: String!
  }

  extend type Query {
    """All RedactionProfiles for the active org. Builtins are seeded
    on first call, so the list is never empty. ANALYST role."""
    redactionProfiles: [RedactionProfile!]!
  }

  extend type Mutation {
    """
    Set or clear a Hunt's redaction profile. Pass null to remove
    masking entirely (full bundle on next export). ANALYST role.
    Returns the updated profileId (or null).
    """
    setHuntRedactionProfile(huntId: ID!, profileId: ID): ID
  }
`;
