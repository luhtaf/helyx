import { writeAuditEvent } from './repo.js';

/**
 * Audit log helper — takes PRIMITIVES, not RequestContext.
 *
 * Per CLAUDE.md repo/resolver boundary: repo functions never receive ctx.
 * Caller extracts tenantId + userId from ctx after assertOrgRole. This shape
 * also lets background jobs / migration scripts emit audit events (no ctx).
 *
 * Action naming convention: <entity>.<verb> lowercase.
 * Examples: 'case.archive', 'stakeholder.archive', 'reconciliation.resolve',
 *           'reconciliation.bulk_resolve'
 *
 * Best-effort: never throws — never break the user's mutation due to audit
 * failure. Compliance reviewers should be aware.
 *
 * Compliance query (who did what in last 30 days):
 *   MATCH (a:AuditEvent {tenantId: $tenantId})
 *   WHERE a.actorUserId = $userId AND a.ts >= datetime() - duration({days: 30})
 *   RETURN a ORDER BY a.ts DESC LIMIT 100;
 *
 * Retention: AuditEvent has NO TTL — implement retention policy before scaling:
 *   MATCH (a:AuditEvent) WHERE a.ts < datetime() - duration({years: 2}) DETACH DELETE a;
 */
export async function logAudit(
  tenantId: string,
  actorUserId: string,
  action: string,
  target: { type: string; id: string },
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  await writeAuditEvent({
    tenantId,
    actorUserId,
    action,
    targetType: target.type,
    targetId: target.id,
    before,
    after,
  });
}
