import { IOC_TYPES } from '../kinds.js';

// W2.5 — GraphQL surface for tenant intel-pool IOCs attributed to
// Actor × TTP edges. Distinct from the case-bound :Artifact:Ioc:
// these are loose tenant-wide intel that operators add on the spot
// from the actor-scoped graph view.
export const ctiIocsTypeDefs = /* GraphQL */ `
  enum CtiIocType { ${IOC_TYPES.join(' ')} }

  """A tenant intel-pool IOC attributed to a specific (Actor × TTP) pair.
  Distinct from :Artifact:Ioc which is case-bound; CtiIoc is loose
  tenant intel that operators add on-the-spot ('I just learned APT38
  uses domain X for T1486')."""
  type CtiIoc {
    id: ID!
    iocType: CtiIocType!
    value: String!
    notes: String
    source: String
    addedByUserId: ID!
    addedAt: String!
    actorId: ID!
    actorName: String!
    techniqueId: String!
    techniqueName: String!
  }

  input AddCtiIocInput {
    iocType: CtiIocType!
    value: String!
    notes: String
    source: String
    """:IntrusionSet.id — the actor this IOC is attributed to."""
    actorId: ID!
    """:AttackPattern.id (T-code) — the TTP this IOC hints at."""
    techniqueId: String!
  }

  extend type Query {
    """W2.5 — Indicators for a specific (Actor × TTP) pair within current tenant."""
    indicatorsForActorTtp(actorId: ID!, techniqueId: String!): [CtiIoc!]!
    """Single IOC fetch for graph transforms (ioc.actor / ioc.technique).
    Returns null when not found or in a different tenant. ANALYST role."""
    ctiIoc(id: ID!): CtiIoc
  }

  input AddCtiIocsBulkInput {
    iocType: CtiIocType!
    """Newline-split values from operator paste. Trim + dedup happens server-side."""
    values: [String!]!
    notes: String
    source: String
    actorId: ID!
    techniqueId: String!
  }

  type BulkAddResult {
    added: Int!
    duplicates: Int!
    invalid: Int!
  }

  extend type Mutation {
    """W2.5 — Add a tenant intel IOC attributed to (actor, technique).
    Idempotent on (tenantId, value, actorId, techniqueId): returns
    existing IOC if duplicate."""
    addCtiIoc(input: AddCtiIocInput!): CtiIoc!
    """W2.5b — Bulk add IOCs from a paste-list. Server trims + dedupes
    + idempotent-MERGEs. Returns per-bucket counts for the toast."""
    addCtiIocsBulk(input: AddCtiIocsBulkInput!): BulkAddResult!
    """W2.5 — Delete a tenant intel IOC. Tenant-guarded."""
    deleteCtiIoc(id: ID!): Boolean!
  }
`;
