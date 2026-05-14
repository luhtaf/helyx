import { randomUUID } from 'node:crypto';
import { getSession } from '../../db/neo4j.js';
import {
  PUSH_TARGET_KINDS,
  type CtiPushTarget, type CtiPushAttempt,
  type PushTargetKind, type PushTargetStatus, type PushOutcome,
} from './types.js';

const TARGET_RETURN = `
  t.id AS id, t.tenantId AS tenantId, t.kind AS kind, t.label AS label,
  t.url AS url, coalesce(t.maxTier, 'internal') AS maxTier,
  coalesce(t.dryRun, true) AS dryRun,
  coalesce(t.status, 'active') AS status,
  coalesce(t.apiKey, '') AS apiKey,
  t.addedByUserId AS addedByUserId,
  toString(t.createdAt) AS createdAt,
  toString(t.updatedAt) AS updatedAt
`;

function recordToTarget(rec: { get: (k: string) => unknown }): CtiPushTarget {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    kind: rec.get('kind') as PushTargetKind,
    label: rec.get('label') as string,
    url: rec.get('url') as string,
    maxTier: rec.get('maxTier') as string,
    dryRun: rec.get('dryRun') as boolean,
    status: rec.get('status') as PushTargetStatus,
    apiKey: rec.get('apiKey') as string,
    addedByUserId: rec.get('addedByUserId') as string,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
  };
}

export async function listPushTargets(tenantId: string): Promise<CtiPushTarget[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (t:CtiPushTarget {tenantId: $tenantId})
       RETURN ${TARGET_RETURN}
       ORDER BY t.status ASC, t.createdAt DESC`,
      { tenantId },
    );
    return r.records.map(recordToTarget);
  } finally {
    await session.close();
  }
}

export async function getPushTarget(
  tenantId: string,
  id: string,
): Promise<CtiPushTarget | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (t:CtiPushTarget {tenantId: $tenantId, id: $id})
       RETURN ${TARGET_RETURN}`,
      { tenantId, id },
    );
    return r.records.length === 0 ? null : recordToTarget(r.records[0]!);
  } finally {
    await session.close();
  }
}

export interface CreatePushTargetInput {
  kind: PushTargetKind;
  label: string;
  url: string;
  maxTier: string;
  apiKey: string;
  dryRun: boolean;
}

export async function createPushTarget(
  tenantId: string,
  addedByUserId: string,
  input: CreatePushTargetInput,
): Promise<CtiPushTarget> {
  if (!(PUSH_TARGET_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`Invalid kind: ${input.kind}`);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `CREATE (t:CtiPushTarget {
           id: $id, tenantId: $tenantId, kind: $kind, label: $label,
           url: $url, maxTier: $maxTier, apiKey: $apiKey,
           dryRun: $dryRun, status: 'active',
           addedByUserId: $addedByUserId,
           createdAt: datetime($now), updatedAt: datetime($now)
         })
         RETURN ${TARGET_RETURN}`,
        { id, tenantId, addedByUserId, now, ...input },
      ),
    );
    return recordToTarget(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function setPushTargetStatus(
  tenantId: string,
  id: string,
  status: PushTargetStatus,
): Promise<CtiPushTarget | null> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (t:CtiPushTarget {tenantId: $tenantId, id: $id})
         SET t.status = $status, t.updatedAt = datetime()
         RETURN ${TARGET_RETURN}`,
        { tenantId, id, status },
      ),
    );
    return r.records.length === 0 ? null : recordToTarget(r.records[0]!);
  } finally {
    await session.close();
  }
}

// ─── Attempts (audit ledger) ────────────────────────────────────────

// Labels denormalized at write-time onto the :CtiPushAttempt node:
//   - target.label can change after this attempt was recorded
//   - hunt.name can change too
//   - audit history wants the values *at attempt time*, not now
// So readback is a plain projection — no pattern comprehension needed.
const ATTEMPT_RETURN = `
  a.id AS id, a.tenantId AS tenantId,
  a.targetId AS targetId,
  a.targetLabel AS targetLabel,
  a.huntId AS huntId,
  a.huntName AS huntName,
  toString(a.ts) AS ts,
  a.outcome AS outcome,
  a.bundleContentHash AS bundleContentHash,
  a.indicatorCount AS indicatorCount,
  a.errorDetail AS errorDetail,
  a.actorUserId AS actorUserId
`;

function recordToAttempt(rec: { get: (k: string) => unknown }): CtiPushAttempt {
  const indicatorCount = rec.get('indicatorCount');
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    targetId: rec.get('targetId') as string,
    targetLabel: (rec.get('targetLabel') as string | null) ?? null,
    huntId: rec.get('huntId') as string,
    huntName: (rec.get('huntName') as string | null) ?? null,
    ts: rec.get('ts') as string,
    outcome: rec.get('outcome') as PushOutcome,
    bundleContentHash: (rec.get('bundleContentHash') as string | null) ?? null,
    indicatorCount: indicatorCount === null || indicatorCount === undefined
      ? null
      : Number(indicatorCount),
    errorDetail: (rec.get('errorDetail') as string | null) ?? null,
    actorUserId: rec.get('actorUserId') as string,
  };
}

export async function listPushAttempts(
  tenantId: string,
  limit: number,
): Promise<CtiPushAttempt[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:CtiPushAttempt {tenantId: $tenantId})
       RETURN ${ATTEMPT_RETURN}
       ORDER BY a.ts DESC
       LIMIT toInteger($limit)`,
      { tenantId, limit: BigInt(limit) },
    );
    return r.records.map(recordToAttempt);
  } finally {
    await session.close();
  }
}

interface RecordAttemptInput {
  targetId: string;
  /** Denormalized at write-time — captures target.label as it was when
   *  this attempt ran. Audit history wants attempt-time values. */
  targetLabel: string | null;
  huntId: string;
  /** Denormalized at write-time — same reason as targetLabel. */
  huntName: string | null;
  outcome: PushOutcome;
  bundleContentHash?: string | null;
  indicatorCount?: number | null;
  errorDetail?: string | null;
  actorUserId: string;
}

export async function recordPushAttempt(
  tenantId: string,
  input: RecordAttemptInput,
): Promise<CtiPushAttempt> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const errorDetail = input.errorDetail ? input.errorDetail.slice(0, 1000) : null;
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `CREATE (a:CtiPushAttempt {
           id: $id, tenantId: $tenantId,
           targetId: $targetId, targetLabel: $targetLabel,
           huntId: $huntId, huntName: $huntName,
           ts: datetime($now), outcome: $outcome,
           bundleContentHash: $bundleContentHash,
           indicatorCount: $indicatorCount,
           errorDetail: $errorDetail,
           actorUserId: $actorUserId
         })
         RETURN ${ATTEMPT_RETURN}`,
        {
          id, tenantId, now,
          targetId: input.targetId,
          targetLabel: input.targetLabel,
          huntId: input.huntId,
          huntName: input.huntName,
          outcome: input.outcome,
          bundleContentHash: input.bundleContentHash ?? null,
          indicatorCount: input.indicatorCount ?? null,
          errorDetail,
          actorUserId: input.actorUserId,
        },
      ),
    );
    return recordToAttempt(r.records[0]!);
  } finally {
    await session.close();
  }
}

/** Tiny helper for push.ts — denormalizes hunt name onto the attempt. */
export async function fetchHuntName(
  tenantId: string,
  huntId: string,
): Promise<string | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {tenantId: $tenantId, id: $huntId}) RETURN h.name AS name`,
      { tenantId, huntId },
    );
    if (r.records.length === 0) return null;
    return (r.records[0]!.get('name') as string | null) ?? null;
  } finally {
    await session.close();
  }
}
