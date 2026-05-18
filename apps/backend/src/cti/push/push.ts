import { GraphQLError } from 'graphql';
import { createHash } from 'node:crypto';
import { buildHuntStixBundle } from '../../exporters/stix.js';
import { isHostnameAllowed } from '../egress/repo.js';
import { logAudit } from '../../audits/log.js';
import { fetchHuntName, getPushTarget, recordPushAttempt } from './repo.js';
import { uploadStixToMisp } from './misp/client.js';
import { uploadStixToTaxii } from './taxii/client.js';
import type { CtiPushAttempt, CtiPushTarget, PushOutcome } from './types.js';

// H7/H9 — push pipeline orchestration. Threads through every gate
// the trust-tier model requires:
//   F1 (release tier)  — implicit in buildHuntStixBundle via Hunt.releaseTier
//                        + pre-condition rule.tier ≤ target.maxTier (TODO: per-rule
//                        check before bundle build; for v1 we trust hunt.releaseTier
//                        ≤ target.maxTier as a proxy)
//   F2 (signing)        — implicit in stix exporter (signBytes + persist)
//   F3a (redaction)     — implicit in stix exporter (applyRedaction before sign)
//   F3b (egress)        — explicit assertEgressAllowed before HTTP
//
// Outcomes always land in :CtiPushAttempt + :AuditEvent regardless of
// success/denial. dryRun=true short-circuits before HTTP but still
// records the attempt as 'dry_run' so the audit shows the attempt
// would have proceeded.

export interface PushResult {
  attempt: CtiPushAttempt;
  /** When outcome=success/dry_run, sha256 of the bytes pushed (matches
   *  StixExport.contentHash from the same bundle build). */
  bundleContentHash: string | null;
}

function denyOutcomeForTier(huntTier: string, targetMaxTier: string): boolean {
  const RANK: Record<string, number> = {
    'public': 1, 'cross-agency': 2, 'sectoral': 3, 'internal': 4,
  };
  const huntRank = RANK[huntTier] ?? 4;
  const targetRank = RANK[targetMaxTier] ?? 1;
  // Hunt at rank N needs target.maxTier ≥ N (target trusted enough).
  return huntRank > targetRank;
}

async function recordAndAudit(
  tenantId: string,
  actorUserId: string,
  target: CtiPushTarget | null,
  huntId: string,
  huntName: string | null,
  outcome: PushOutcome,
  detail: { bundleContentHash?: string | null; indicatorCount?: number | null; errorDetail?: string | null } = {},
): Promise<CtiPushAttempt> {
  const targetId = target?.id ?? '—';
  const attempt = await recordPushAttempt(tenantId, {
    targetId,
    targetLabel: target?.label ?? null,
    huntId,
    huntName,
    outcome,
    actorUserId,
    bundleContentHash: detail.bundleContentHash ?? null,
    indicatorCount: detail.indicatorCount ?? null,
    errorDetail: detail.errorDetail ?? null,
  });
  await logAudit(
    tenantId, actorUserId,
    `cti_push.${outcome}`,
    { type: 'CtiPushAttempt', id: attempt.id },
    null,
    {
      targetId,
      targetLabel: target?.label ?? null,
      targetKind: target?.kind ?? null,
      huntId,
      bundleContentHash: detail.bundleContentHash ?? null,
      indicatorCount: detail.indicatorCount ?? null,
    },
  );
  return attempt;
}

/**
 * Push a hunt's signed STIX bundle to a configured target.
 *
 * Tenant-scoped. Caller must have already passed assertOrgRole.
 * Returns the recorded attempt (success, denied_*, failed_*, or dry_run).
 *
 * Throws GraphQLError only on hard input errors (missing target, etc).
 * Operational denials (tier/egress/no-rules) record an attempt + return
 * it so the FE can render the reason — no exception thrown.
 */
export async function pushHuntToTarget(
  tenantId: string,
  actorUserId: string,
  huntId: string,
  targetId: string,
): Promise<PushResult> {
  const target = await getPushTarget(tenantId, targetId);
  if (!target) {
    throw new GraphQLError('push target not found', {
      extensions: { code: 'NOT_FOUND', targetId },
    });
  }

  // Cheap denormalization fetch for the audit row. We do this even if
  // the hunt later fails — operator wants to see "tried to push X"
  // not just "tried to push huntId=abc123".
  const huntName = await fetchHuntName(tenantId, huntId);

  // Gate 0 — target must be active.
  if (target.status !== 'active') {
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'denied_target_disabled',
      { errorDetail: `target ${target.label} is ${target.status}` },
    );
    return { attempt: a, bundleContentHash: null };
  }

  // Build the bundle (F1 release tier + F2 sign + F3a redaction all
  // baked in here). Failure here is a generator bug or no approved
  // rules; both surface as failed_export.
  const built = await buildHuntStixBundle(tenantId, huntId);
  if (!built.ok) {
    const outcome: PushOutcome = built.reason.startsWith('no approved rules')
      ? 'denied_no_approved_rules'
      : 'failed_export';
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, outcome,
      { errorDetail: built.reason },
    );
    return { attempt: a, bundleContentHash: null };
  }
  const result = built.result;
  const bundleContentHash = createHash('sha256').update(result.bytes).digest('hex');

  // Gate 1 — F1 release tier vs target.maxTier
  if (denyOutcomeForTier(result.stats.tier, target.maxTier)) {
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'denied_egress',
      {
        bundleContentHash,
        indicatorCount: result.stats.indicatorCount,
        errorDetail: `hunt tier '${result.stats.tier}' exceeds target.maxTier '${target.maxTier}'`,
      },
    );
    return { attempt: a, bundleContentHash };
  }

  // Gate 2 — F3b egress allowlist
  let hostname = '';
  try {
    hostname = new URL(target.url).hostname.toLowerCase();
  } catch {
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'failed_export',
      { errorDetail: `invalid target.url: ${target.url}` },
    );
    return { attempt: a, bundleContentHash };
  }
  const egressOk = await isHostnameAllowed(tenantId, hostname);
  if (!egressOk) {
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'denied_egress',
      {
        bundleContentHash,
        indicatorCount: result.stats.indicatorCount,
        errorDetail: `hostname '${hostname}' not on PDN allowlist`,
      },
    );
    return { attempt: a, bundleContentHash };
  }

  // dryRun short-circuit — we've validated everything that doesn't
  // require a live MISP/TAXII. Operator gets to see "would have
  // pushed N indicators" without producing real network traffic.
  if (target.dryRun) {
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'dry_run',
      {
        bundleContentHash,
        indicatorCount: result.stats.indicatorCount,
      },
    );
    return { attempt: a, bundleContentHash };
  }

  // Real HTTP push. Each kind has its own client; switch dispatches.
  if (target.kind === 'MISP') {
    const r = await uploadStixToMisp(target.url, target.apiKey, result.json);
    if (r.ok) {
      const a = await recordAndAudit(
        tenantId, actorUserId, target, huntId, huntName, 'success',
        {
          bundleContentHash,
          indicatorCount: result.stats.indicatorCount,
          errorDetail: r.eventId ? `MISP event id: ${r.eventId}` : null,
        },
      );
      return { attempt: a, bundleContentHash };
    }
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'failed_http',
      {
        bundleContentHash,
        indicatorCount: result.stats.indicatorCount,
        errorDetail: r.errorDetail ?? `MISP HTTP ${r.status}`,
      },
    );
    return { attempt: a, bundleContentHash };
  }

  // H9 — TAXII 2.1: re-wrap bundle as envelope + POST to the collection.
  if (target.kind === 'TAXII') {
    const r = await uploadStixToTaxii(target.url, target.apiKey, result.json);
    if (r.ok) {
      const a = await recordAndAudit(
        tenantId, actorUserId, target, huntId, huntName, 'success',
        {
          bundleContentHash,
          indicatorCount: result.stats.indicatorCount,
          errorDetail: r.statusId ? `TAXII status id: ${r.statusId}` : null,
        },
      );
      return { attempt: a, bundleContentHash };
    }
    const a = await recordAndAudit(
      tenantId, actorUserId, target, huntId, huntName, 'failed_http',
      {
        bundleContentHash,
        indicatorCount: result.stats.indicatorCount,
        errorDetail: r.errorDetail ?? `TAXII HTTP ${r.status}`,
      },
    );
    return { attempt: a, bundleContentHash };
  }

  // OPENCTI / ECLECTICIQ live clients still pending. Friendly error so
  // operator knows to use dryRun for these kinds.
  const a = await recordAndAudit(
    tenantId, actorUserId, target, huntId, huntName, 'failed_http',
    {
      bundleContentHash,
      indicatorCount: result.stats.indicatorCount,
      errorDetail: `live HTTP push not implemented yet for kind=${target.kind}; flip dryRun=true to test the pipeline`,
    },
  );
  return { attempt: a, bundleContentHash };
}
