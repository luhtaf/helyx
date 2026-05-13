import { randomUUID } from 'node:crypto';
import { getSession } from '../../db/neo4j.js';
import {
  isValidHostname,
  normalizeHostname,
  type PdnEgressEntry,
  type EgressStatus,
} from './types.js';

const RETURN_FIELDS = `
  e.id AS id, e.tenantId AS tenantId,
  e.hostname AS hostname, e.label AS label,
  coalesce(e.status, 'active') AS status,
  e.addedByUserId AS addedByUserId,
  u.email AS addedByEmail,
  toString(e.createdAt) AS createdAt,
  toString(e.disabledAt) AS disabledAt,
  e.disabledByUserId AS disabledByUserId
`;

function recordToEntry(rec: { get: (k: string) => unknown }): PdnEgressEntry {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    hostname: rec.get('hostname') as string,
    label: rec.get('label') as string,
    status: rec.get('status') as EgressStatus,
    addedByUserId: rec.get('addedByUserId') as string,
    addedByEmail: (rec.get('addedByEmail') as string | null) ?? null,
    createdAt: rec.get('createdAt') as string,
    disabledAt: (rec.get('disabledAt') as string | null) ?? null,
    disabledByUserId: (rec.get('disabledByUserId') as string | null) ?? null,
  };
}

export async function listEgressEntries(tenantId: string): Promise<PdnEgressEntry[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (e:PdnEgressEntry {tenantId: $tenantId})
       OPTIONAL MATCH (u:User {id: e.addedByUserId})
       RETURN ${RETURN_FIELDS}
       ORDER BY e.status ASC, e.createdAt DESC`,
      { tenantId },
    );
    return r.records.map(recordToEntry);
  } finally {
    await session.close();
  }
}

export async function getEgressEntry(
  tenantId: string,
  id: string,
): Promise<PdnEgressEntry | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (e:PdnEgressEntry {tenantId: $tenantId, id: $id})
       OPTIONAL MATCH (u:User {id: e.addedByUserId})
       RETURN ${RETURN_FIELDS}`,
      { tenantId, id },
    );
    return r.records.length === 0 ? null : recordToEntry(r.records[0]!);
  } finally {
    await session.close();
  }
}

/**
 * Add a hostname to the tenant's allowlist. If the same hostname exists
 * as 'disabled', re-enable that row (preserves audit trail). If it
 * exists as 'active', no-op + return the existing row (operator
 * idempotency).
 *
 * Throws on invalid hostname — caller should pre-validate via
 * isValidHostname so it can surface a friendly error before the round-trip.
 */
export async function addEgressEntry(
  tenantId: string,
  addedByUserId: string,
  hostnameRaw: string,
  label: string,
): Promise<PdnEgressEntry> {
  const hostname = normalizeHostname(hostnameRaw);
  if (!isValidHostname(hostname)) {
    throw new Error(`invalid hostname: ${hostnameRaw}`);
  }
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Look for any existing entry on (tenantId, hostname) — active or
      // disabled. Prefer the most recent.
      const existing = await tx.run(
        `MATCH (e:PdnEgressEntry {tenantId: $tenantId, hostname: $hostname})
         OPTIONAL MATCH (u:User {id: e.addedByUserId})
         RETURN ${RETURN_FIELDS}
         ORDER BY e.createdAt DESC
         LIMIT 1`,
        { tenantId, hostname },
      );
      if (existing.records.length > 0) {
        const row = recordToEntry(existing.records[0]!);
        if (row.status === 'active') return row; // Idempotent re-add
        // Re-enable a disabled row, refresh label + clear disabled state
        const reenabled = await tx.run(
          `MATCH (e:PdnEgressEntry {id: $id})
           SET e.status = 'active', e.label = $label,
               e.disabledAt = null, e.disabledByUserId = null
           WITH e
           OPTIONAL MATCH (u:User {id: e.addedByUserId})
           RETURN ${RETURN_FIELDS}`,
          { id: row.id, label },
        );
        return recordToEntry(reenabled.records[0]!);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      const created = await tx.run(
        `CREATE (e:PdnEgressEntry {
           id: $id, tenantId: $tenantId,
           hostname: $hostname, label: $label,
           status: 'active', addedByUserId: $addedByUserId,
           createdAt: datetime($now)
         })
         WITH e
         OPTIONAL MATCH (u:User {id: e.addedByUserId})
         RETURN ${RETURN_FIELDS}`,
        { id, tenantId, hostname, label, addedByUserId, now },
      );
      return recordToEntry(created.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export async function disableEgressEntry(
  tenantId: string,
  id: string,
  disabledByUserId: string,
): Promise<PdnEgressEntry | null> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (e:PdnEgressEntry {tenantId: $tenantId, id: $id})
         SET e.status = 'disabled', e.disabledAt = datetime(),
             e.disabledByUserId = $disabledByUserId
         WITH e
         OPTIONAL MATCH (u:User {id: e.addedByUserId})
         RETURN ${RETURN_FIELDS}`,
        { tenantId, id, disabledByUserId },
      ),
    );
    return r.records.length === 0 ? null : recordToEntry(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function enableEgressEntry(
  tenantId: string,
  id: string,
): Promise<PdnEgressEntry | null> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (e:PdnEgressEntry {tenantId: $tenantId, id: $id})
         SET e.status = 'active', e.disabledAt = null, e.disabledByUserId = null
         WITH e
         OPTIONAL MATCH (u:User {id: e.addedByUserId})
         RETURN ${RETURN_FIELDS}`,
        { tenantId, id },
      ),
    );
    return r.records.length === 0 ? null : recordToEntry(r.records[0]!);
  } finally {
    await session.close();
  }
}

/** Hot-path lookup used by the egress guard. Returns true iff the
 *  hostname is on the active allowlist for this tenant. */
export async function isHostnameAllowed(
  tenantId: string,
  hostname: string,
): Promise<boolean> {
  const normalized = normalizeHostname(hostname);
  if (!isValidHostname(normalized)) return false;
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (e:PdnEgressEntry {tenantId: $tenantId, hostname: $hostname})
       WHERE coalesce(e.status, 'active') = 'active'
       RETURN e.id LIMIT 1`,
      { tenantId, hostname: normalized },
    );
    return r.records.length > 0;
  } finally {
    await session.close();
  }
}
