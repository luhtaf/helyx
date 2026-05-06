export interface AuditTarget {
  type: string;
  id: string;
}

export interface AuditEventRow {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ts: string;
}
