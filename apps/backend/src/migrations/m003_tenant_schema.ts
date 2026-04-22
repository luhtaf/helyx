import type { Migration } from './types.js';

export const m003_tenant_schema: Migration = {
  id: '003_tenant_schema',
  description: 'User, Organization, Team — uniqueness + lookup indexes',
  up: [
    `CREATE CONSTRAINT user_id_unique IF NOT EXISTS
     FOR (u:User) REQUIRE u.id IS UNIQUE`,

    `CREATE CONSTRAINT user_email_unique IF NOT EXISTS
     FOR (u:User) REQUIRE u.email IS UNIQUE`,

    `CREATE CONSTRAINT organization_id_unique IF NOT EXISTS
     FOR (o:Organization) REQUIRE o.id IS UNIQUE`,

    `CREATE CONSTRAINT organization_slug_unique IF NOT EXISTS
     FOR (o:Organization) REQUIRE o.slug IS UNIQUE`,

    `CREATE CONSTRAINT team_id_unique IF NOT EXISTS
     FOR (t:Team) REQUIRE t.id IS UNIQUE`,

    `CREATE CONSTRAINT team_org_slug_unique IF NOT EXISTS
     FOR (t:Team) REQUIRE (t.organizationId, t.slug) IS UNIQUE`,

    `CREATE INDEX user_created_at IF NOT EXISTS
     FOR (u:User) ON (u.createdAt)`,

    `CREATE INDEX organization_created_at IF NOT EXISTS
     FOR (o:Organization) ON (o.createdAt)`,
  ],
};
