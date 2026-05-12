import { getSession } from '../db/neo4j.js';
import { logger } from '../logger.js';

/**
 * Append a new :AuditEvent. Best-effort: failures log + degrade, never throw.
 * Audit completeness is NOT atomic with the audited operation — if the op
 * succeeded but audit failed (Redis/Neo4j blip), op is un-audited.
 * Acceptable per project policy (OWASP ASVS L2 V10.3.4 — log to Neo4j, future
 * phase streams to dedicated append-only sink).
 */
export async function writeAuditEvent(input: {
  tenantId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (a:AuditEvent {
           id: randomUUID(),
           tenantId: $tenantId,
           actorUserId: $actorUserId,
           action: $action,
           targetType: $targetType,
           targetId: $targetId,
           before: $before,
           after: $after,
           ts: datetime()
         })`,
        {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          before: input.before ? JSON.stringify(input.before) : null,
          after: input.after ? JSON.stringify(input.after) : null,
        },
      ),
    );
  } catch (err) {
    logger.warn(
      { err: String(err), action: input.action, target: `${input.targetType}:${input.targetId}` },
      'audit write failed (degraded)',
    );
  } finally {
    await session.close();
  }
}

import type { AuditEventRow } from './types.js';

export interface AuditEventListFilter {
  action: string | null;
  actorUserId: string | null;
  targetType: string | null;
  /** ISO datetime, inclusive lower bound */
  since: string | null;
  /** ISO datetime, exclusive upper bound */
  until: string | null;
}

// Tenant-scoped read. Newest first. Filters are AND-combined; null = no
// filter on that field. Limit clamped 1-100. Offset paginated; for very
// long history switch to cursor pagination later.
export async function listAuditEvents(
  tenantId: string,
  filter: AuditEventListFilter,
  page: number,
  perPage: number,
): Promise<AuditEventRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:AuditEvent {tenantId: $tenantId})
       WHERE ($action IS NULL OR a.action = $action)
         AND ($actorUserId IS NULL OR a.actorUserId = $actorUserId)
         AND ($targetType IS NULL OR a.targetType = $targetType)
         AND ($since IS NULL OR a.ts >= datetime($since))
         AND ($until IS NULL OR a.ts <  datetime($until))
       RETURN a.id AS id, a.tenantId AS tenantId,
              a.actorUserId AS actorUserId, a.action AS action,
              a.targetType AS targetType, a.targetId AS targetId,
              a.before AS before, a.after AS after,
              toString(a.ts) AS ts
       ORDER BY a.ts DESC
       SKIP toInteger($skip) LIMIT toInteger($limit)`,
      {
        tenantId,
        action: filter.action,
        actorUserId: filter.actorUserId,
        targetType: filter.targetType,
        since: filter.since,
        until: filter.until,
        skip: Math.max(0, (page - 1) * perPage),
        limit: Math.max(1, Math.min(perPage, 100)),
      },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      tenantId: rec.get('tenantId') as string,
      actorUserId: rec.get('actorUserId') as string,
      action: rec.get('action') as string,
      targetType: rec.get('targetType') as string,
      targetId: rec.get('targetId') as string,
      before: parseMaybeJson(rec.get('before') as string | null),
      after: parseMaybeJson(rec.get('after') as string | null),
      ts: rec.get('ts') as string,
    }));
  } finally {
    await session.close();
  }
}

export async function countAuditEvents(
  tenantId: string,
  filter: AuditEventListFilter,
): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:AuditEvent {tenantId: $tenantId})
       WHERE ($action IS NULL OR a.action = $action)
         AND ($actorUserId IS NULL OR a.actorUserId = $actorUserId)
         AND ($targetType IS NULL OR a.targetType = $targetType)
         AND ($since IS NULL OR a.ts >= datetime($since))
         AND ($until IS NULL OR a.ts <  datetime($until))
       RETURN count(a) AS n`,
      {
        tenantId,
        action: filter.action,
        actorUserId: filter.actorUserId,
        targetType: filter.targetType,
        since: filter.since,
        until: filter.until,
      },
    );
    const raw = r.records[0]?.get('n');
    if (raw == null) return 0;
    return typeof raw === 'number' ? raw : Number((raw as { toString: () => string }).toString());
  } finally {
    await session.close();
  }
}

// Distinct action names for the filter dropdown. Tenant-scoped so a fresh
// tenant doesn't see other tenants' verbs. Cheap (~10s of rows max).
export async function listDistinctAuditActions(tenantId: string): Promise<string[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:AuditEvent {tenantId: $tenantId})
       RETURN DISTINCT a.action AS action
       ORDER BY action`,
      { tenantId },
    );
    return r.records.map((rec) => rec.get('action') as string);
  } finally {
    await session.close();
  }
}

function parseMaybeJson(s: string | null): Record<string, unknown> | null {
  if (s == null) return null;
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
