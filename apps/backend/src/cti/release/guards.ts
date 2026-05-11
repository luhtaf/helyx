import { createHash } from 'node:crypto';
import { RELEASE_TIER_RANK, type ReleaseTier } from '../kinds.js';

// F1c — Reusable push-readiness guard. Centralizes the "can rule X go
// out at tier Y?" decision so every push path (H7 MISP, H7 OpenCTI,
// H9 EclecticIQ, H9 TAXII server, future H7 federation) has one source
// of truth and identical audit semantics.
//
// Three blocking reasons in current scope:
//   1. tier_too_high — rule.releaseTier > target.maxTier (F1 violation)
//   2. unapproved    — rule.approvedAt is null (F2 violation)
//   3. stale_approval — content edited after approval (F2 freshness)

export type PushBlockReason = 'tier_too_high' | 'unapproved' | 'stale_approval';

export interface PushReadiness {
  allowed: boolean;
  reason: PushBlockReason | null;
  detail: string | null;
}

export interface RulePushInputs {
  id: string;
  releaseTier: ReleaseTier;
  approvedAt: string | null;
  approvalContentHash: string | null;
  content: string;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export interface HuntRulePushReadinessRow {
  ruleId: string;
  ruleName: string;
  ruleKind: string;
  ruleTier: ReleaseTier;
  approvalState: 'approved' | 'stale' | 'unapproved';
  // Per-target-tier readiness — same 4 keys mirror the FE's RELEASE_TIERS
  byTier: {
    public: PushReadiness;
    'cross-agency': PushReadiness;
    sectoral: PushReadiness;
    internal: PushReadiness;
  };
}

export interface HuntPushReadinessSummary {
  totalRules: number;
  approvedCount: number;
  staleCount: number;
  unapprovedCount: number;
  // Per-target-tier shipping count: how many rules in this hunt could
  // be pushed if target.maxTier was X.
  shipCountByTier: {
    public: number;
    'cross-agency': number;
    sectoral: number;
    internal: number;
  };
}

const ALL_TIERS: ReleaseTier[] = ['public', 'cross-agency', 'sectoral', 'internal'];

// Compute the per-rule × per-tier matrix for a hunt's generated rules.
// Pure function: caller fetches the rule rows from Neo4j, this folds.
export function computeHuntPushReadiness(rules: Array<RulePushInputs & { name: string; kind: string }>): {
  rows: HuntRulePushReadinessRow[];
  summary: HuntPushReadinessSummary;
} {
  const rows: HuntRulePushReadinessRow[] = [];
  const summary: HuntPushReadinessSummary = {
    totalRules: rules.length,
    approvedCount: 0,
    staleCount: 0,
    unapprovedCount: 0,
    shipCountByTier: { public: 0, 'cross-agency': 0, sectoral: 0, internal: 0 },
  };

  for (const r of rules) {
    // Determine approval state once (reused for the row + summary).
    const internalReadiness = checkRulePushAllowed(r, 'internal');
    let approvalState: 'approved' | 'stale' | 'unapproved';
    if (internalReadiness.reason === 'unapproved') approvalState = 'unapproved';
    else if (internalReadiness.reason === 'stale_approval') approvalState = 'stale';
    else approvalState = 'approved';

    if (approvalState === 'approved') summary.approvedCount++;
    else if (approvalState === 'stale') summary.staleCount++;
    else summary.unapprovedCount++;

    const byTier = {
      public:         checkRulePushAllowed(r, 'public'),
      'cross-agency': checkRulePushAllowed(r, 'cross-agency'),
      sectoral:       checkRulePushAllowed(r, 'sectoral'),
      internal:       internalReadiness,
    };

    for (const t of ALL_TIERS) {
      if (byTier[t].allowed) summary.shipCountByTier[t]++;
    }

    rows.push({
      ruleId: r.id,
      ruleName: r.name,
      ruleKind: r.kind,
      ruleTier: r.releaseTier,
      approvalState,
      byTier,
    });
  }

  return { rows, summary };
}

// Pure function — no DB. Caller fetches the rule, then asks the guard.
// Returns { allowed: true, reason: null } when push is permitted.
export function checkRulePushAllowed(
  rule: RulePushInputs,
  targetMaxTier: ReleaseTier,
): PushReadiness {
  // Tier check first (F1)
  if (RELEASE_TIER_RANK[rule.releaseTier] > RELEASE_TIER_RANK[targetMaxTier]) {
    return {
      allowed: false,
      reason: 'tier_too_high',
      detail: `rule tier '${rule.releaseTier}' (rank ${RELEASE_TIER_RANK[rule.releaseTier]}) exceeds target max '${targetMaxTier}' (rank ${RELEASE_TIER_RANK[targetMaxTier]})`,
    };
  }
  // Approval check (F2)
  if (!rule.approvedAt || !rule.approvalContentHash) {
    return {
      allowed: false,
      reason: 'unapproved',
      detail: 'rule has no current approval — analyst must approve before push',
    };
  }
  // Stale check (F2) — sha256(content) vs approvalContentHash
  const currentHash = sha256(rule.content);
  if (currentHash !== rule.approvalContentHash) {
    return {
      allowed: false,
      reason: 'stale_approval',
      detail: 'rule content was edited after approval — re-approval required',
    };
  }
  return { allowed: true, reason: null, detail: null };
}
