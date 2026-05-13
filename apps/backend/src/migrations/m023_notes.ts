import type { Migration } from './types.js';

// H4 — operator-authored markdown notes attached to any tenant-owned
// entity. Polymorphic via property pair on the node itself (entityType
// + entityId) — Neo4j has no first-class polymorphic edges, so this is
// the cleanest pattern. Allows a single :Note label that covers CVE
// notes, Asset notes, Hunt notes, etc, with one repo + one resolver
// shape.
//
// Tenant-scoped: every Note carries tenantId. Cross-tenant leakage
// guarded at repo level.
export const m023_notes: Migration = {
  id: '023_notes',
  description: 'H4 — Note (markdown) attached to any tenant-owned entity via entityType+entityId.',
  up: [
    `CREATE CONSTRAINT note_id_unique IF NOT EXISTS
     FOR (n:Note) REQUIRE n.id IS UNIQUE`,

    // Composite index — fastest "give me notes about Asset 123" lookup.
    // Tenant filter applied in WHERE on top of the index hit.
    `CREATE INDEX note_target IF NOT EXISTS
     FOR (n:Note) ON (n.entityType, n.entityId)`,

    `CREATE INDEX note_tenant IF NOT EXISTS
     FOR (n:Note) ON (n.tenantId)`,
  ],
};
