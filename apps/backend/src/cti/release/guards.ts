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
