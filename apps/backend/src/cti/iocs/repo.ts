import { randomUUID } from 'node:crypto';
import { getSession } from '../../db/neo4j.js';
import { GraphQLError } from 'graphql';
import type { IocType } from '../kinds.js';

// W2.5 — Tenant intel-pool IOCs attributed to (Actor × TTP) pairs.
// Edges (:CtiIoc)-[:ATTRIBUTED_TO]->(:IntrusionSet) and
//       (:CtiIoc)-[:HINTS_AT_TTP]->(:AttackPattern) created at insert
// time. Both required for an IOC to surface in the actor-scoped TTP
// indicators panel.

export interface CtiIocRow {
  id: string;
  tenantId: string;
  iocType: IocType;
  value: string;
  notes: string | null;
  source: string | null;
  addedByUserId: string;
  addedAt: string;
  // Resolved at query time:
  actorId: string;
  actorName: string;
  techniqueId: string;
  techniqueName: string;
}

export interface CreateCtiIocInput {
  iocType: IocType;
  value: string;
  notes?: string | null;
  source?: string | null;
  actorId: string;       // :IntrusionSet.id
  techniqueId: string;   // :AttackPattern.id (T-code)
}

// Indicators for a specific (actor, technique) pair within a tenant.
// Sorted newest-first so the panel surfaces fresh intel at the top.
export async function listIndicatorsForActorTtp(
  tenantId: string,
  actorId: string,
  techniqueId: string,
): Promise<CtiIocRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (i:CtiIoc {tenantId: $tenantId})-[:ATTRIBUTED_TO]->(a:IntrusionSet {id: $actorId}),
             (i)-[:HINTS_AT_TTP]->(t:AttackPattern {id: $techniqueId})
       RETURN i.id AS id, i.tenantId AS tenantId, i.iocType AS iocType, i.value AS value,
              i.notes AS notes, i.source AS source, i.addedByUserId AS addedByUserId,
              toString(i.addedAt) AS addedAt,
              a.id AS actorId, a.name AS actorName,
              t.id AS techniqueId, t.name AS techniqueName
       ORDER BY i.addedAt DESC LIMIT 200`,
      { tenantId, actorId, techniqueId },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      tenantId: rec.get('tenantId') as string,
      iocType: rec.get('iocType') as IocType,
      value: rec.get('value') as string,
      notes: (rec.get('notes') as string | null) ?? null,
      source: (rec.get('source') as string | null) ?? null,
      addedByUserId: rec.get('addedByUserId') as string,
      addedAt: rec.get('addedAt') as string,
      actorId: rec.get('actorId') as string,
      actorName: rec.get('actorName') as string,
      techniqueId: rec.get('techniqueId') as string,
      techniqueName: rec.get('techniqueName') as string,
    }));
  } finally {
    await session.close();
  }
}

// Add a new IOC + create both edges in one transaction. Validates that
// both actor and technique exist before insert (operator-input safety).
// Idempotent on (tenantId, value, actorId, techniqueId): re-adding the
// same IOC for the same (actor, ttp) returns the existing one.
export async function addIndicatorForActorTtp(
  tenantId: string,
  userId: string,
  input: CreateCtiIocInput,
): Promise<CtiIocRow> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Validate actor + technique exist (cheap node-existence check).
      const valid = await tx.run(
        `OPTIONAL MATCH (a:IntrusionSet {id: $actorId})
         OPTIONAL MATCH (t:AttackPattern {id: $techniqueId})
         RETURN a IS NOT NULL AS actorOk, t IS NOT NULL AS techOk`,
        { actorId: input.actorId, techniqueId: input.techniqueId },
      );
      const v = valid.records[0];
      if (!v?.get('actorOk')) {
        throw new GraphQLError(`Actor not found: ${input.actorId}`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      if (!v?.get('techOk')) {
        throw new GraphQLError(`Technique not found: ${input.techniqueId}`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Idempotent check
      const existing = await tx.run(
        `MATCH (i:CtiIoc {tenantId: $tenantId, value: $value})
              -[:ATTRIBUTED_TO]->(:IntrusionSet {id: $actorId})
         MATCH (i)-[:HINTS_AT_TTP]->(:AttackPattern {id: $techniqueId})
         RETURN i.id AS id LIMIT 1`,
        { tenantId, value: input.value, actorId: input.actorId, techniqueId: input.techniqueId },
      );
      const existingId = existing.records[0]?.get('id') as string | undefined;
      if (existingId) {
        const list = await listIndicatorsForActorTtpInTx(tx, tenantId, input.actorId, input.techniqueId);
        const found = list.find((x) => x.id === existingId);
        if (found) return found;
      }

      const id = randomUUID();
      await tx.run(
        `MATCH (a:IntrusionSet {id: $actorId})
         MATCH (t:AttackPattern {id: $techniqueId})
         CREATE (i:CtiIoc {
           id: $id, tenantId: $tenantId, iocType: $iocType, value: $value,
           notes: $notes, source: $source, addedByUserId: $userId, addedAt: datetime()
         })
         CREATE (i)-[:ATTRIBUTED_TO]->(a)
         CREATE (i)-[:HINTS_AT_TTP]->(t)`,
        {
          id, tenantId, userId,
          actorId: input.actorId, techniqueId: input.techniqueId,
          iocType: input.iocType, value: input.value,
          notes: input.notes ?? null, source: input.source ?? null,
        },
      );

      const list = await listIndicatorsForActorTtpInTx(tx, tenantId, input.actorId, input.techniqueId);
      const created = list.find((x) => x.id === id);
      if (!created) {
        throw new GraphQLError('Failed to read back created IOC', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
      return created;
    });
  } finally {
    await session.close();
  }
}

// Helper used inside a write tx to read back the just-created row.
// Same query as listIndicatorsForActorTtp but takes an open tx.
async function listIndicatorsForActorTtpInTx(
  tx: { run: (cypher: string, params: Record<string, unknown>) => Promise<{ records: Array<{ get: (k: string) => unknown }> }> },
  tenantId: string,
  actorId: string,
  techniqueId: string,
): Promise<CtiIocRow[]> {
  const r = await tx.run(
    `MATCH (i:CtiIoc {tenantId: $tenantId})-[:ATTRIBUTED_TO]->(a:IntrusionSet {id: $actorId}),
           (i)-[:HINTS_AT_TTP]->(t:AttackPattern {id: $techniqueId})
     RETURN i.id AS id, i.tenantId AS tenantId, i.iocType AS iocType, i.value AS value,
            i.notes AS notes, i.source AS source, i.addedByUserId AS addedByUserId,
            toString(i.addedAt) AS addedAt,
            a.id AS actorId, a.name AS actorName,
            t.id AS techniqueId, t.name AS techniqueName
     ORDER BY i.addedAt DESC LIMIT 200`,
    { tenantId, actorId, techniqueId },
  );
  return r.records.map((rec) => ({
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    iocType: rec.get('iocType') as IocType,
    value: rec.get('value') as string,
    notes: (rec.get('notes') as string | null) ?? null,
    source: (rec.get('source') as string | null) ?? null,
    addedByUserId: rec.get('addedByUserId') as string,
    addedAt: rec.get('addedAt') as string,
    actorId: rec.get('actorId') as string,
    actorName: rec.get('actorName') as string,
    techniqueId: rec.get('techniqueId') as string,
    techniqueName: rec.get('techniqueName') as string,
  }));
}

export interface BulkAddInput {
  iocType: IocType;
  values: string[];        // dedup + trim happens here
  notes?: string | null;   // applied to all
  source?: string | null;  // applied to all
  actorId: string;
  techniqueId: string;
}

export interface BulkAddResult {
  added: number;       // newly created
  duplicates: number;  // skipped (already attributed to this actor+ttp)
  invalid: number;     // skipped (empty/whitespace after trim)
}

// W2.5b — Bulk add IOCs in one tx via UNWIND. Trims + dedupes
// caller-side values, then dedupes against existing (tenantId, value,
// actorId, techniqueId) tuples in DB. Operator with 50 IOCs at hand
// shouldn't click Add 50 times.
export async function addIndicatorsBulk(
  tenantId: string,
  userId: string,
  input: BulkAddInput,
): Promise<BulkAddResult> {
  // Pre-filter: trim, drop empties, dedupe within input batch (case-sensitive
  // for hashes, lowercased for hostnames is operator's job — we don't
  // normalize since IP/HASH/etc shouldn't be normalized identically).
  const seen = new Set<string>();
  const cleaned: string[] = [];
  let invalid = 0;
  for (const raw of input.values) {
    const v = raw.trim();
    if (!v) { invalid++; continue; }
    if (seen.has(v)) { invalid++; continue; }
    seen.add(v);
    cleaned.push(v);
  }
  if (cleaned.length === 0) return { added: 0, duplicates: 0, invalid };

  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Validate actor + technique exist (one query for both).
      const valid = await tx.run(
        `OPTIONAL MATCH (a:IntrusionSet {id: $actorId})
         OPTIONAL MATCH (t:AttackPattern {id: $techniqueId})
         RETURN a IS NOT NULL AS actorOk, t IS NOT NULL AS techOk`,
        { actorId: input.actorId, techniqueId: input.techniqueId },
      );
      const v = valid.records[0];
      if (!v?.get('actorOk')) {
        throw new GraphQLError(`Actor not found: ${input.actorId}`, { extensions: { code: 'NOT_FOUND' } });
      }
      if (!v?.get('techOk')) {
        throw new GraphQLError(`Technique not found: ${input.techniqueId}`, { extensions: { code: 'NOT_FOUND' } });
      }

      // Single MERGE-by-(tenantId, value, actorId, techniqueId) round-trip
      // via UNWIND. ON CREATE sets node properties + ts; ON MATCH no-ops.
      // Attribution edges are MERGEd unconditionally (idempotent).
      const rows = cleaned.map((v) => ({ id: randomUUID(), value: v }));
      const r = await tx.run(
        `MATCH (a:IntrusionSet {id: $actorId})
         MATCH (t:AttackPattern {id: $techniqueId})
         UNWIND $rows AS row
         OPTIONAL MATCH (existing:CtiIoc {tenantId: $tenantId, value: row.value})
                  -[:ATTRIBUTED_TO]->(a)
         WHERE EXISTS { (existing)-[:HINTS_AT_TTP]->(t) }
         WITH row, a, t, existing
         CALL {
           WITH row, a, t, existing
           WITH row, a, t, existing WHERE existing IS NULL
           CREATE (i:CtiIoc {
             id: row.id, tenantId: $tenantId, iocType: $iocType, value: row.value,
             notes: $notes, source: $source, addedByUserId: $userId, addedAt: datetime()
           })
           CREATE (i)-[:ATTRIBUTED_TO]->(a)
           CREATE (i)-[:HINTS_AT_TTP]->(t)
           RETURN 1 AS createdFlag
           UNION
           WITH row, a, t, existing
           WITH row, a, t, existing WHERE existing IS NOT NULL
           RETURN 0 AS createdFlag
         }
         RETURN sum(createdFlag) AS added, count(*) AS total`,
        {
          tenantId, userId,
          actorId: input.actorId, techniqueId: input.techniqueId,
          iocType: input.iocType,
          notes: input.notes ?? null, source: input.source ?? null,
          rows,
        },
      );
      const rec = r.records[0];
      const added = Number(rec?.get('added') ?? 0);
      const total = Number(rec?.get('total') ?? 0);
      return { added, duplicates: total - added, invalid };
    });
  } finally {
    await session.close();
  }
}

// Delete an IOC. Detach all edges. Tenant-guarded so cross-tenant
// IDs cannot be deleted via crafted mutations.
export async function deleteCtiIoc(tenantId: string, iocId: string): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (i:CtiIoc {id: $iocId, tenantId: $tenantId})
         DETACH DELETE i
         RETURN count(i) AS deleted`,
        { tenantId, iocId },
      ),
    );
    return Number(r.records[0]?.get('deleted') ?? 0) > 0;
  } finally {
    await session.close();
  }
}
