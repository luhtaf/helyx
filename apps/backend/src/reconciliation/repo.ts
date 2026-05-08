import { GraphQLError } from 'graphql';
import { getSession } from '../db/neo4j.js';
import { listStakeholders } from '../stakeholders/repo.js';
import { rankSuggestions } from './fuzzy.js';
import type { RawStakeholderRow, ReconciliationStatus, SuggestionRow } from './types.js';

// ---------------------------------------------------------------------------
// Row helper
// ---------------------------------------------------------------------------

const RAW_RETURN = `
  r.id AS id,
  r.source AS source,
  r.rawName AS rawName,
  r.normalizedKey AS normalizedKey,
  r.rawSektor AS rawSektor,
  r.hitCount AS hitCount,
  r.targetCount AS targetCount,
  toString(r.lastSeen) AS lastSeen,
  r.status AS status,
  r.confidence AS confidence,
  r.resolvedBy AS resolvedBy,
  toString(r.resolvedAt) AS resolvedAt
`;

function rowToRaw(rec: { get: (k: string) => unknown }): RawStakeholderRow {
  const resolvedToId = rec.get('resolvedToId') as string | null;
  const hitCount = rec.get('hitCount') as number | bigint | null;
  const targetCount = rec.get('targetCount') as number | bigint | null;
  const confidence = rec.get('confidence') as number | bigint | null;
  return {
    id: rec.get('id') as string,
    source: rec.get('source') as string,
    rawName: rec.get('rawName') as string,
    normalizedKey: rec.get('normalizedKey') as string,
    rawSektor: (rec.get('rawSektor') as string | null) ?? null,
    hitCount: Number(hitCount ?? 0),
    targetCount: Number(targetCount ?? 0),
    lastSeen: rec.get('lastSeen') as string,
    status: (rec.get('status') as ReconciliationStatus) ?? 'PENDING',
    confidence: confidence != null ? Number(confidence) : null,
    resolvedBy: (rec.get('resolvedBy') as string | null) ?? null,
    resolvedAt: (rec.get('resolvedAt') as string | null) ?? null,
    resolvedToId: resolvedToId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listRawStakeholders(
  tenantId: string,
  status: ReconciliationStatus,
  first: number,
): Promise<RawStakeholderRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:RawStakeholder)
       WHERE r.tenantId = $tenantId AND r.status = $status
       OPTIONAL MATCH (r)-[:RESOLVED_TO]->(resolved:Stakeholder {tenantId: $tenantId})
       RETURN ${RAW_RETURN}, resolved.id AS resolvedToId
       ORDER BY hitCount DESC, lastSeen DESC
       LIMIT $first`,
      { tenantId, status, first: BigInt(first) },
    );
    return r.records.map(rowToRaw);
  } finally {
    await session.close();
  }
}

export async function findRawStakeholder(
  tenantId: string,
  id: string,
): Promise<RawStakeholderRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:RawStakeholder {id: $id})
       WHERE r.tenantId = $tenantId
       OPTIONAL MATCH (r)-[:RESOLVED_TO]->(resolved:Stakeholder {tenantId: $tenantId})
       RETURN ${RAW_RETURN}, resolved.id AS resolvedToId`,
      { tenantId, id },
    );
    const rec = r.records[0];
    return rec ? rowToRaw(rec) : null;
  } finally {
    await session.close();
  }
}

export async function rawStakeholderCounts(tenantId: string): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  needsReview: number;
}> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:RawStakeholder {tenantId: $tenantId})
       RETURN count(CASE WHEN r.status = 'PENDING'      THEN 1 END) AS pending,
              count(CASE WHEN r.status = 'APPROVED'     THEN 1 END) AS approved,
              count(CASE WHEN r.status = 'REJECTED'     THEN 1 END) AS rejected,
              count(CASE WHEN r.status = 'NEEDS_REVIEW' THEN 1 END) AS needsReview`,
      { tenantId },
    );
    const rec = r.records[0];
    return {
      pending: Number(rec?.get('pending') ?? 0),
      approved: Number(rec?.get('approved') ?? 0),
      rejected: Number(rec?.get('rejected') ?? 0),
      needsReview: Number(rec?.get('needsReview') ?? 0),
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function resolveRawStakeholder(
  tenantId: string,
  rawId: string,
  stakeholderId: string,
  resolverUserId: string,
): Promise<RawStakeholderRow> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Guard: only PENDING rows may be resolved — prevents double-resolve race
      const pendingCheck = await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId AND r.status = 'PENDING'
         RETURN r.id AS id`,
        { rawId, tenantId },
      );
      if (pendingCheck.records.length === 0) {
        throw new GraphQLError('Raw stakeholder not PENDING (already resolved or rejected)', {
          extensions: { code: 'ALREADY_RESOLVED' },
        });
      }

      // Delete any existing RESOLVED_TO edge (allow re-resolving within PENDING)
      await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         OPTIONAL MATCH (r)-[e:RESOLVED_TO]->(:Stakeholder)
         DELETE e`,
        { rawId, tenantId },
      );

      // Merge new RESOLVED_TO edge + set status
      await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         MATCH (k:Stakeholder {id: $stakeholderId})
         WHERE k.tenantId = $tenantId
         MERGE (r)-[:RESOLVED_TO]->(k)
         SET r.status = 'APPROVED',
             r.resolvedAt = datetime(),
             r.resolvedBy = $resolverUserId`,
        { rawId, tenantId, stakeholderId, resolverUserId },
      );

      const result = await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         OPTIONAL MATCH (r)-[:RESOLVED_TO]->(resolved:Stakeholder {tenantId: $tenantId})
         RETURN ${RAW_RETURN}, resolved.id AS resolvedToId`,
        { rawId, tenantId },
      );
      return rowToRaw(result.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export async function bulkResolveRawStakeholders(
  tenantId: string,
  rawIds: string[],
  stakeholderId: string,
  resolverUserId: string,
): Promise<number> {
  const session = getSession();
  try {
    const r = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (k:Stakeholder {id: $stakeholderId})
         WHERE k.tenantId = $tenantId
         WITH k
         UNWIND $rawIds AS rid
         MATCH (r:RawStakeholder {id: rid})
         WHERE r.tenantId = $tenantId AND r.status = 'PENDING'
         OPTIONAL MATCH (r)-[e:RESOLVED_TO]->(:Stakeholder)
         DELETE e
         WITH r, k
         MERGE (r)-[:RESOLVED_TO]->(k)
         SET r.status = 'APPROVED',
             r.resolvedAt = datetime(),
             r.resolvedBy = $resolverUserId
         RETURN count(r) AS updated`,
        { tenantId, rawIds, stakeholderId, resolverUserId },
      ),
    );
    return Number(r.records[0]?.get('updated') ?? 0);
  } finally {
    await session.close();
  }
}

export async function rejectRawStakeholder(
  tenantId: string,
  rawId: string,
  reason: string | null,
  resolverUserId: string,
): Promise<RawStakeholderRow> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         SET r.status = 'REJECTED',
             r.resolvedAt = datetime(),
             r.resolvedBy = $resolverUserId,
             r.rejectReason = CASE WHEN $reason IS NOT NULL THEN $reason ELSE r.rejectReason END`,
        { rawId, tenantId, resolverUserId, reason },
      );

      const result = await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         OPTIONAL MATCH (r)-[:RESOLVED_TO]->(resolved:Stakeholder {tenantId: $tenantId})
         RETURN ${RAW_RETURN}, resolved.id AS resolvedToId`,
        { rawId, tenantId },
      );
      return rowToRaw(result.records[0]!);
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export async function listSuggestionsForRaw(
  tenantId: string,
  rawId: string,
): Promise<Array<{ stakeholderId: string; confidence: number; reason: string }>> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:RawStakeholder {id: $rawId})
       WHERE r.tenantId = $tenantId
       MATCH (r)-[s:SUGGESTED]->(k:Stakeholder)
       WHERE k.tenantId = $tenantId
       RETURN k.id AS stakeholderId, s.confidence AS confidence, s.reason AS reason
       ORDER BY s.confidence DESC`,
      { tenantId, rawId },
    );
    return r.records.map((rec) => ({
      stakeholderId: rec.get('stakeholderId') as string,
      confidence: Number(rec.get('confidence')),
      reason: rec.get('reason') as string,
    }));
  } finally {
    await session.close();
  }
}

export async function cacheSuggestions(
  tenantId: string,
  rawId: string,
  suggestions: SuggestionRow[],
): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      // Delete existing SUGGESTED edges from this raw row
      await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         OPTIONAL MATCH (r)-[s:SUGGESTED]->(:Stakeholder)
         DELETE s`,
        { rawId, tenantId },
      );

      if (suggestions.length === 0) return;

      // Merge new SUGGESTED edges
      await tx.run(
        `MATCH (r:RawStakeholder {id: $rawId})
         WHERE r.tenantId = $tenantId
         UNWIND $suggestions AS sug
         MATCH (k:Stakeholder {id: sug.stakeholderId})
         WHERE k.tenantId = $tenantId
         MERGE (r)-[s:SUGGESTED]->(k)
         SET s.confidence = sug.confidence, s.reason = sug.reason`,
        { rawId, tenantId, suggestions },
      );
    });
  } finally {
    await session.close();
  }
}

export async function recomputeSuggestionsForAll(tenantId: string): Promise<number> {
  // Load all PENDING raw stakeholders
  const session = getSession();
  let pendingRaws: RawStakeholderRow[];
  try {
    const r = await session.run(
      `MATCH (r:RawStakeholder)
       WHERE r.tenantId = $tenantId AND r.status = 'PENDING'
       OPTIONAL MATCH (r)-[:RESOLVED_TO]->(resolved:Stakeholder)
       WHERE resolved.tenantId = $tenantId
       RETURN r, resolved.id AS resolvedToId`,
      { tenantId },
    );
    pendingRaws = r.records.map(rowToRaw);
  } finally {
    await session.close();
  }

  if (pendingRaws.length === 0) return 0;

  // Load all stakeholders for this tenant (candidates for matching)
  const allStakeholders = await listStakeholders(tenantId, {});

  // Compute and cache suggestions per raw row
  for (const raw of pendingRaws) {
    const suggestions = rankSuggestions(
      { rawName: raw.rawName, rawNormalizedKey: raw.normalizedKey },
      allStakeholders,
    );
    await cacheSuggestions(tenantId, raw.id, suggestions);
  }

  return pendingRaws.length;
}
