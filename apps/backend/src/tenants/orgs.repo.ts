import { getSession } from '../db/neo4j.js';
import type { OrgRole } from '../auth/types.js';
import { newId } from '../utils/uuid.js';

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface OrganizationWithRole extends OrganizationRecord {
  myRole: OrgRole;
}

export async function findOrganizationById(id: string): Promise<OrganizationRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (o:Organization {id: $id})
       RETURN o.id AS id, o.name AS name, o.slug AS slug, toString(o.createdAt) AS createdAt`,
      { id },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return { id: rec.get('id'), name: rec.get('name'), slug: rec.get('slug'), createdAt: rec.get('createdAt') };
  } finally {
    await session.close();
  }
}

export async function findOrganizationBySlug(slug: string): Promise<OrganizationRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (o:Organization {slug: $slug})
       RETURN o.id AS id, o.name AS name, o.slug AS slug, toString(o.createdAt) AS createdAt`,
      { slug },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return { id: rec.get('id'), name: rec.get('name'), slug: rec.get('slug'), createdAt: rec.get('createdAt') };
  } finally {
    await session.close();
  }
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  ownerUserId: string;
}

export async function createOrganization(input: CreateOrgInput): Promise<OrganizationRecord> {
  const id = newId();
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {id: $ownerUserId})
       CREATE (o:Organization {id: $id, name: $name, slug: $slug, createdAt: datetime()})
       CREATE (u)-[:MEMBER_OF {role: 'OWNER', joinedAt: datetime()}]->(o)
       RETURN o.id AS id, o.name AS name, o.slug AS slug, toString(o.createdAt) AS createdAt`,
      { id, name: input.name, slug: input.slug, ownerUserId: input.ownerUserId },
    );
    const rec = r.records[0]!;
    return { id: rec.get('id'), name: rec.get('name'), slug: rec.get('slug'), createdAt: rec.get('createdAt') };
  } finally {
    await session.close();
  }
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationWithRole[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {id: $userId})-[m:MEMBER_OF]->(o:Organization)
       RETURN o.id AS id, o.name AS name, o.slug AS slug,
              toString(o.createdAt) AS createdAt, m.role AS role
       ORDER BY o.createdAt`,
      { userId },
    );
    return r.records.map((rec) => ({
      id: rec.get('id'),
      name: rec.get('name'),
      slug: rec.get('slug'),
      createdAt: rec.get('createdAt'),
      myRole: rec.get('role') as OrgRole,
    }));
  } finally {
    await session.close();
  }
}

export interface AddMemberInput {
  orgId: string;
  userEmail: string;
  role: OrgRole;
}

export interface MembershipRecord {
  userId: string;
  userEmail: string;
  userDisplayName: string;
  orgId: string;
  role: OrgRole;
  joinedAt: string;
}

export async function addMember(input: AddMemberInput): Promise<MembershipRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {email: $email}), (o:Organization {id: $orgId})
       MERGE (u)-[m:MEMBER_OF]->(o)
       ON CREATE SET m.role = $role, m.joinedAt = datetime()
       ON MATCH SET m.role = $role
       RETURN u.id AS userId, u.email AS email, u.displayName AS displayName,
              o.id AS orgId, m.role AS role, toString(m.joinedAt) AS joinedAt`,
      { email: input.userEmail.trim().toLowerCase(), orgId: input.orgId, role: input.role },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return {
      userId: rec.get('userId'),
      userEmail: rec.get('email'),
      userDisplayName: rec.get('displayName'),
      orgId: rec.get('orgId'),
      role: rec.get('role') as OrgRole,
      joinedAt: rec.get('joinedAt'),
    };
  } finally {
    await session.close();
  }
}

export async function listMembers(orgId: string): Promise<MembershipRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User)-[m:MEMBER_OF]->(o:Organization {id: $orgId})
       RETURN u.id AS userId, u.email AS email, u.displayName AS displayName,
              o.id AS orgId, m.role AS role, toString(m.joinedAt) AS joinedAt
       ORDER BY m.joinedAt`,
      { orgId },
    );
    return r.records.map((rec) => ({
      userId: rec.get('userId'),
      userEmail: rec.get('email'),
      userDisplayName: rec.get('displayName'),
      orgId: rec.get('orgId'),
      role: rec.get('role') as OrgRole,
      joinedAt: rec.get('joinedAt'),
    }));
  } finally {
    await session.close();
  }
}
