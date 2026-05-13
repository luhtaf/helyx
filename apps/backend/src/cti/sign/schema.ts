// F2 — operator surface for the per-org Ed25519 signing keypairs.
// Schema deliberately omits the private-key blob; only public material
// + status metadata leaves the backend.
export const ctiKeypairTypeDefs = /* GraphQL */ `
  enum CtiKeypairStatus {
    """Currently used to sign new exports. Exactly one per tenant."""
    active
    """Demoted by rotation. Bundles signed by it remain verifiable."""
    previous
    """Operator declared compromised; downstream verifiers should reject."""
    revoked
  }

  type CtiOrgKeypair {
    id: ID!
    """sha256(publicKeyPem)[0..16] — short identifier for operators."""
    fingerprint: String!
    publicKeyPem: String!
    algorithm: String!
    status: CtiKeypairStatus!
    createdAt: String!
    """Set when this key was demoted from 'active' (rotation event)."""
    rotatedAt: String
    """Set when status moved to 'revoked'."""
    revokedAt: String
    revokedReason: String
  }

  """One entry in the per-tenant rotation ledger. Created every time
  rotateCtiKeypair runs."""
  type CtiKeypairRotation {
    id: ID!
    ts: String!
    actorUserId: ID!
    """Email of the user who triggered the rotation. Null if account deleted."""
    actorEmail: String
    """Id of the demoted keypair. Null on the tenant's very first rotation
    (no prior active keypair existed)."""
    oldKeypairId: ID
    """Fingerprint of the demoted keypair (sha256 of public key, first 16
    hex chars). Null when oldKeypairId is null or when the prior key was
    revoked + cleaned up."""
    oldFingerprint: String
    newKeypairId: ID!
    newFingerprint: String!
    reason: String!
  }

  extend type Query {
    """All keypairs for the active org, newest first. ANALYST role."""
    ctiOrgKeypairs: [CtiOrgKeypair!]!
    """Per-tenant rotation ledger entries, newest first. ANALYST role."""
    ctiKeypairRotations: [CtiKeypairRotation!]!
  }

  extend type Mutation {
    """
    Mint a new active keypair and demote the current active to 'previous'.
    OWNER role — high blast radius. 'reason' is mandatory and surfaces in
    the rotation ledger + audit log.
    """
    rotateCtiKeypair(reason: String!): CtiOrgKeypair!

    """
    Mark a non-active keypair as revoked. Cannot revoke the active key —
    rotate first. OWNER role.
    """
    revokeCtiKeypair(keypairId: ID!, reason: String!): CtiOrgKeypair!
  }
`;
