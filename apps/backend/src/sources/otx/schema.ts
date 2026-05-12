import { OTX_IOC_KINDS } from './types.js';

export const otxTypeDefs = /* GraphQL */ `
  enum OtxIocKind { ${OTX_IOC_KINDS.join(' ')} }

  """H6 — On-demand OTX (AlienVault) intel lookup. Pulse-flattened
  summary plus aggregated adversary / MITRE / malware-family attribution.
  Transient — does not persist to local DB (yet). Free OTX API tier:
  10K req/hr per key."""
  type OtxLookupResult {
    queriedValue: String!
    queriedKind: OtxIocKind!
    pulseCount: Int!
    pulses: [OtxPulse!]!
    """Distinct adversary names across all pulses."""
    adversaries: [String!]!
    """Distinct MITRE ATT&CK ids across all pulses."""
    attackIds: [String!]!
    """Distinct malware family names."""
    malwareFamilies: [String!]!
    """Distinct tag labels."""
    tags: [String!]!
  }

  type OtxPulse {
    id: ID!
    name: String!
    description: String!
    author: String!
    modifiedAt: String
    tags: [String!]!
    attackIds: [String!]!
    adversary: String!
    malwareFamilies: [String!]!
    targetedCountries: [String!]!
    industries: [String!]!
    references: [String!]!
  }

  extend type Query {
    """Look up an indicator in OTX. ANALYST role minimum. Throws an
    actionable error when OTX_API_KEY is unset. 'not seen' returns
    pulseCount: 0 (no error)."""
    otxLookup(value: String!, kind: OtxIocKind!): OtxLookupResult!
  }
`;
