// H7/H9 — push targets + attempts surface.
// Listing is ANALYST. Target CRUD + push trigger is OWNER (egress
// surface, trust-tier-up).
export const ctiPushTypeDefs = /* GraphQL */ `
  enum CtiPushTargetKind {
    MISP
    OPENCTI
    TAXII
    ECLECTICIQ
  }

  enum CtiPushTargetStatus {
    active
    disabled
  }

  enum CtiPushOutcome {
    success
    dry_run
    denied_no_approved_rules
    denied_egress
    denied_target_disabled
    failed_export
    failed_http
  }

  type CtiPushTarget {
    id: ID!
    kind: CtiPushTargetKind!
    label: String!
    url: String!
    """F1 — push pre-condition: hunt.releaseTier ≤ target.maxTier."""
    maxTier: ReleaseTier!
    """When true, the push runs all gates but stops short of HTTP.
    Pipeline records 'dry_run' outcome. Default v1: true."""
    dryRun: Boolean!
    status: CtiPushTargetStatus!
    """Returned masked — never the real value. Set via mutation."""
    apiKeyMasked: String!
    addedByUserId: ID!
    createdAt: String!
    updatedAt: String!
  }

  type CtiPushAttempt {
    id: ID!
    targetId: ID!
    targetLabel: String
    huntId: ID!
    huntName: String
    ts: String!
    outcome: CtiPushOutcome!
    bundleContentHash: String
    indicatorCount: Int
    errorDetail: String
    actorUserId: ID!
  }

  input CreatePushTargetInput {
    kind: CtiPushTargetKind!
    label: String!
    url: String!
    maxTier: ReleaseTier!
    apiKey: String!
    """v1 default true — operator flips to false when ready to wire
    real MISP/TAXII."""
    dryRun: Boolean! = true
  }

  type PushHuntResult {
    attempt: CtiPushAttempt!
    """sha256(stixBundle.bytes) when one was built; null when failed
    before bundle build."""
    bundleContentHash: String
  }

  extend type Query {
    """All push targets for the active org. ANALYST role."""
    ctiPushTargets: [CtiPushTarget!]!
    """Recent push attempts (newest first, capped 100). ANALYST role."""
    ctiPushAttempts(limit: Int = 50): [CtiPushAttempt!]!
  }

  extend type Mutation {
    """Register a new push target. OWNER role."""
    addCtiPushTarget(input: CreatePushTargetInput!): CtiPushTarget!

    """Soft-delete a target. OWNER role."""
    disableCtiPushTarget(id: ID!): CtiPushTarget!
    """Re-enable a disabled target. OWNER role."""
    enableCtiPushTarget(id: ID!): CtiPushTarget!

    """Build + sign + push a hunt's STIX bundle to the named target.
    Always returns an attempt — operational denials (tier/egress/no
    approved rules) record an attempt + return it for the FE to render
    the reason. OWNER role.

    On dry-run targets, the pipeline runs all gate checks then stops
    short of HTTP (outcome=dry_run). Real HTTP push not implemented
    yet for v1 — non-dry targets land 'failed_http' with a clear
    operator message."""
    pushHuntToTarget(huntId: ID!, targetId: ID!): PushHuntResult!
  }
`;
