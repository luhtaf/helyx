// H7/H9 — CTI push target kinds.
//
// MISP: REST API + STIX 2.1 upload via /events/upload_stix       (live)
// TAXII: STIX TAXII 2.1 add-objects envelope POST                (live)
// OPENCTI: GraphQL multipart uploadImport (Bearer token)         (live)
// ECLECTICIQ: routed through the TAXII client — EIQ Intelligence
//   Center ingests STIX 2.1 via its native TAXII 2.1 inbox       (live)
//
// All four kinds have a live client. The push pipeline + F1/F2/F3
// gates + audit ledger work uniformly across kinds.

export const PUSH_TARGET_KINDS = ['MISP', 'OPENCTI', 'TAXII', 'ECLECTICIQ'] as const;
export type PushTargetKind = (typeof PUSH_TARGET_KINDS)[number];

export const PUSH_TARGET_STATUSES = ['active', 'disabled'] as const;
export type PushTargetStatus = (typeof PUSH_TARGET_STATUSES)[number];

// Outcomes mirror what each gate can produce. The naming is shared
// with audit + UI so the same string flows end-to-end.
export const PUSH_OUTCOMES = [
  'success',
  'dry_run',
  'denied_no_approved_rules',
  'denied_egress',
  'denied_target_disabled',
  'failed_export',
  'failed_http',
] as const;
export type PushOutcome = (typeof PUSH_OUTCOMES)[number];

export interface CtiPushTarget {
  id: string;
  tenantId: string;
  kind: PushTargetKind;
  label: string;
  url: string;
  /** F1 — push pre-condition: rule.tier ≤ target.maxTier. Stored as
   *  the dashed form ('public' | 'cross-agency' | 'sectoral' |
   *  'internal') consistent with everywhere else. */
  maxTier: string;
  /** v1 default true — gate checks run, no real HTTP. */
  dryRun: boolean;
  status: PushTargetStatus;
  /** Operator-supplied API key. Stored verbatim for v1 (TODO: encrypt
   *  with a separate at-rest key like CTI_SIGNING_MASTER_KEY before
   *  going prod). Empty string when target doesn't need auth. */
  apiKey: string;
  addedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CtiPushAttempt {
  id: string;
  tenantId: string;
  targetId: string;
  targetLabel: string | null;
  huntId: string;
  huntName: string | null;
  ts: string;
  outcome: PushOutcome;
  /** Sha256 of the STIX bundle bytes when one was built; null when the
   *  pipeline died before that point. Useful for matching :StixExport
   *  records to push attempts. */
  bundleContentHash: string | null;
  indicatorCount: number | null;
  /** Operator-readable error detail. Capped at 1KB to keep the audit
   *  table light. */
  errorDetail: string | null;
  actorUserId: string;
}
