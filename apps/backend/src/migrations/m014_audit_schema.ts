import type { Migration } from './types.js';

export const m014_audit_schema: Migration = {
  id: '014_audit_schema',
  description: 'AuditEvent — append-only audit log for sensitive operations (OWASP ASVS L2 V10.3.4)',
  up: [
    `CREATE CONSTRAINT audit_event_id_unique IF NOT EXISTS
     FOR (a:AuditEvent) REQUIRE a.id IS UNIQUE`,
    `CREATE INDEX audit_event_tenant_ts IF NOT EXISTS
     FOR (a:AuditEvent) ON (a.tenantId, a.ts)`,
    `CREATE INDEX audit_event_actor IF NOT EXISTS
     FOR (a:AuditEvent) ON (a.actorUserId)`,
    `CREATE INDEX audit_event_target IF NOT EXISTS
     FOR (a:AuditEvent) ON (a.targetType, a.targetId)`,
  ],
};
