import { randomUUID } from 'node:crypto';
import { getSession } from '../db/neo4j.js';

// H4 — markdown notes attached to any tenant-owned entity.
// Polymorphic via (entityType, entityId) property pair on the :Note
// node. Tenant-scoped. Body is stored verbatim — sanitization runs at
// render time on the client (DOMPurify), so the source-of-truth stays
// the operator's keystrokes.

export interface NoteRecord {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  body: string;
  authorUserId: string;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

// Pattern comprehensions for the author's email work in plain MATCH
// queries but choke when they sit in a RETURN that follows a CREATE
// in the same statement (Neo4j 5 quirk). Drive every read through an
// OPTIONAL MATCH on the author so list + create both share the same
// projection clause.
// WITH n is mandatory after CREATE before re-matching; cheap no-op for
// MATCH-only callers, required for createNote's CREATE → MATCH pipeline.
const AUTHOR_LOOKUP = `
  WITH n
  OPTIONAL MATCH (u:User {id: n.authorUserId})
  WITH n, u.email AS authorEmail`;

const RETURN_FIELDS = `
  n.id AS id, n.tenantId AS tenantId,
  n.entityType AS entityType, n.entityId AS entityId,
  n.body AS body,
  n.authorUserId AS authorUserId,
  authorEmail,
  toString(n.createdAt) AS createdAt,
  toString(n.updatedAt) AS updatedAt
`;

function recordToNote(rec: { get: (k: string) => unknown }): NoteRecord {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    entityType: rec.get('entityType') as string,
    entityId: rec.get('entityId') as string,
    body: rec.get('body') as string,
    authorUserId: rec.get('authorUserId') as string,
    authorEmail: (rec.get('authorEmail') as string | null) ?? null,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
  };
}

export async function listNotesFor(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<NoteRecord[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (n:Note {tenantId: $tenantId, entityType: $entityType, entityId: $entityId})
       ${AUTHOR_LOOKUP}
       RETURN ${RETURN_FIELDS}
       ORDER BY n.createdAt DESC`,
      { tenantId, entityType, entityId },
    );
    return r.records.map(recordToNote);
  } finally {
    await session.close();
  }
}

export async function getNote(tenantId: string, id: string): Promise<NoteRecord | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (n:Note {tenantId: $tenantId, id: $id})
       ${AUTHOR_LOOKUP}
       RETURN ${RETURN_FIELDS}`,
      { tenantId, id },
    );
    return r.records.length === 0 ? null : recordToNote(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function createNote(
  tenantId: string,
  authorUserId: string,
  entityType: string,
  entityId: string,
  body: string,
): Promise<NoteRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `CREATE (n:Note {
           id: $id, tenantId: $tenantId,
           entityType: $entityType, entityId: $entityId,
           body: $body,
           authorUserId: $authorUserId,
           createdAt: datetime($now), updatedAt: datetime($now)
         })
         ${AUTHOR_LOOKUP}
       RETURN ${RETURN_FIELDS}`,
        { id, tenantId, entityType, entityId, body, authorUserId, now },
      ),
    );
    return recordToNote(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function updateNote(
  tenantId: string,
  id: string,
  body: string,
): Promise<NoteRecord | null> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (n:Note {tenantId: $tenantId, id: $id})
         SET n.body = $body, n.updatedAt = datetime()
         ${AUTHOR_LOOKUP}
       RETURN ${RETURN_FIELDS}`,
        { tenantId, id, body },
      ),
    );
    return r.records.length === 0 ? null : recordToNote(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function deleteNote(tenantId: string, id: string): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (n:Note {tenantId: $tenantId, id: $id})
         WITH n, n.id AS deletedId
         DETACH DELETE n
         RETURN deletedId`,
        { tenantId, id },
      ),
    );
    return r.records.length > 0;
  } finally {
    await session.close();
  }
}
