import { getSession } from '../db/neo4j.js';
import type { AuthedUser, OrgRole } from '../auth/types.js';
import { newId } from '../utils/uuid.js';

export interface UserRecord extends AuthedUser {
  passwordHash: string;
  createdAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserById(id: string): Promise<AuthedUser | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {id: $id})
       RETURN u.id AS id, u.email AS email, u.displayName AS displayName`,
      { id },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return { id: rec.get('id'), email: rec.get('email'), displayName: rec.get('displayName') };
  } finally {
    await session.close();
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {email: $email})
       RETURN u.id AS id, u.email AS email, u.displayName AS displayName,
              u.passwordHash AS passwordHash, toString(u.createdAt) AS createdAt`,
      { email: normalizeEmail(email) },
    );
    const rec = r.records[0];
    if (!rec) return null;
    return {
      id: rec.get('id'),
      email: rec.get('email'),
      displayName: rec.get('displayName'),
      passwordHash: rec.get('passwordHash'),
      createdAt: rec.get('createdAt'),
    };
  } finally {
    await session.close();
  }
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export async function createUserIfAbsent(input: CreateUserInput): Promise<{ user: AuthedUser; created: boolean }> {
  const id = newId();
  const session = getSession();
  try {
    const r = await session.run(
      `MERGE (u:User {email: $email})
       ON CREATE SET u.id = $id,
                     u.passwordHash = $passwordHash,
                     u.displayName = $displayName,
                     u.createdAt = datetime()
       RETURN u.id AS id, u.email AS email, u.displayName AS displayName, (u.id = $id) AS created`,
      { email: normalizeEmail(input.email), id, passwordHash: input.passwordHash, displayName: input.displayName },
    );
    const rec = r.records[0]!;
    return {
      user: { id: rec.get('id'), email: rec.get('email'), displayName: rec.get('displayName') },
      created: rec.get('created'),
    };
  } finally {
    await session.close();
  }
}

export async function getUserOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {id: $userId})-[m:MEMBER_OF]->(o:Organization {id: $orgId})
       RETURN m.role AS role`,
      { userId, orgId },
    );
    const rec = r.records[0];
    return rec ? (rec.get('role') as OrgRole) : null;
  } finally {
    await session.close();
  }
}
