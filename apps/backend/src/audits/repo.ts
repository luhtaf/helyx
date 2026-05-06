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
