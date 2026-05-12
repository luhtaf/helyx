export const auditTypeDefs = /* GraphQL */ `
  """:AuditEvent — append-only OWASP ASVS L2 V10 record. Captures who
  (actorUserId), what (action 'entity.verb'), on what (targetType+id),
  when (ts), and structured before/after JSON payloads. Tenant-scoped."""
  type AuditEvent {
    id: ID!
    actorUserId: ID!
    actorEmail: String
    actorDisplayName: String
    action: String!
    targetType: String!
    targetId: String!
    """ISO 8601 timestamp."""
    ts: String!
    """JSON-stringified before snapshot (or null for create-class actions)."""
    before: String
    """JSON-stringified after snapshot (or null for delete-class actions)."""
    after: String
  }

  type AuditEventPage {
    items: [AuditEvent!]!
    total: Int!
    page: Int!
    perPage: Int!
  }

  input AuditEventFilter {
    """Exact match on action verb (e.g. 'rule.approve')."""
    action: String
    actorUserId: ID
    targetType: String
    """ISO 8601 lower bound, inclusive."""
    since: String
    """ISO 8601 upper bound, exclusive."""
    until: String
  }

  extend type Query {
    """Tenant-scoped audit log. Newest first. Min role ANALYST — operators
    see their own + peers' actions; this is a compliance / accountability
    surface, not a security secret."""
    auditEvents(filter: AuditEventFilter, page: Int = 1, perPage: Int = 50): AuditEventPage!
    """Distinct action verbs in this tenant's audit log. Used to populate
    the filter dropdown so operators don't have to remember verb names."""
    auditActions: [String!]!
  }
`;
