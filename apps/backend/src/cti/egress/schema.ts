// F3b — operator surface for the PDN egress allowlist.
// Listing is ANALYST so non-owners can audit policy state. Add /
// disable / enable mutations are OWNER (allow-list management is a
// trust-tier-up operation).
export const ctiEgressTypeDefs = /* GraphQL */ `
  enum EgressStatus {
    active
    disabled
  }

  type PdnEgressEntry {
    id: ID!
    """Lowercased hostname only (no scheme/port/path)."""
    hostname: String!
    """Operator-friendly name — 'BSSN MISP', 'Pajak TAXII', etc."""
    label: String!
    status: EgressStatus!
    addedByUserId: ID!
    addedByEmail: String
    createdAt: String!
    disabledAt: String
    disabledByUserId: ID
  }

  type EgressCheck {
    """Lowercased hostname extracted from the URL (or empty when invalid)."""
    hostname: String!
    allowed: Boolean!
    """Reason when allowed=false: 'not_in_allowlist' | 'invalid_url' | 'invalid_hostname'"""
    reason: String
  }

  extend type Query {
    """All PDN egress entries for the active org. Active first, then
    disabled (newest first within each status). ANALYST role."""
    pdnEgressEntries: [PdnEgressEntry!]!

    """Pre-flight check used by FE before push paths land. Returns
    {hostname, allowed, reason}. ANALYST role."""
    checkPdnEgress(url: String!): EgressCheck!
  }

  extend type Mutation {
    """Add a hostname to the allowlist. Idempotent — re-adding an
    existing 'active' row returns it unchanged; re-adding a 'disabled'
    row re-enables + refreshes label. OWNER role.
    Hostname accepts a full URL — scheme/port/path stripped at the
    boundary."""
    addPdnEgressEntry(hostname: String!, label: String!): PdnEgressEntry!

    """Soft-disable: status → 'disabled', disabledAt set. Preserves
    audit trail. OWNER role."""
    disablePdnEgressEntry(id: ID!): PdnEgressEntry!

    """Re-enable a previously disabled entry. OWNER role."""
    enablePdnEgressEntry(id: ID!): PdnEgressEntry!
  }
`;
