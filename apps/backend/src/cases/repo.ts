import { randomUUID } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { getSession } from '../db/neo4j.js';
import type { CaseRow, CaseInput, CaseUpdateInput, ArtifactCounts } from './types.js';
import type { CloseVerdict } from './kinds.js';

// ---------------------------------------------------------------------------
// Return fragment
// ---------------------------------------------------------------------------

const CASE_RETURN = `
  c.id AS id,
  c.reportNo AS reportNo,
  c.title AS title,
  c.trigger AS trigger,
  c.summary AS summary,
  c.status AS status,
  c.verdict AS verdict,
  toString(c.deployedAt) AS deployedAt,
  toString(c.closedAt) AS closedAt,
  c.stakeholderId AS stakeholderId,
  c.leadUserId AS leadUserId,
  toString(c.createdAt) AS createdAt,
  toString(c.updatedAt) AS updatedAt
`;

// ---------------------------------------------------------------------------
// Row helper
// ---------------------------------------------------------------------------

function rowToCase(rec: { get: (k: string) => unknown }): CaseRow {
  return {
    id: rec.get('id') as string,
    reportNo: rec.get('reportNo') as string,
    title: (rec.get('title') as string | null) ?? null,
    trigger: (rec.get('trigger') as string | null) ?? null,
    summary: (rec.get('summary') as string | null) ?? null,
    status: rec.get('status') as CaseRow['status'],
    verdict: (rec.get('verdict') as CaseRow['verdict']) ?? null,
    deployedAt: rec.get('deployedAt') as string,
    closedAt: (rec.get('closedAt') as string | null) ?? null,
    stakeholderId: rec.get('stakeholderId') as string,
    leadUserId: (rec.get('leadUserId') as string | null) ?? null,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listCases(
  tenantId: string,
  filter: {
    stakeholderId?: string;
    status?: string[];
    search?: string;
    first?: number;
    offset?: number;
  },
): Promise<CaseRow[]> {
  const session = getSession();
  const limit = BigInt(filter.first ?? 50);
  const skip = BigInt(filter.offset ?? 0);

  try {
    const params: Record<string, unknown> = { tenantId, limit, skip };
    let cypher: string;

    if (filter.search) {
      params.search = filter.search;
      const conditions: string[] = ['c.tenantId = $tenantId'];
      if (filter.stakeholderId) {
        params.stakeholderId = filter.stakeholderId;
        conditions.push('c.stakeholderId = $stakeholderId');
      }
      if (filter.status?.length) {
        params.statuses = filter.status;
        conditions.push('c.status IN $statuses');
      }
      const where = 'WHERE ' + conditions.join(' AND ');
      cypher = `
        CALL db.index.fulltext.queryNodes('case_search', $search) YIELD node AS c, score
        ${where}
        RETURN ${CASE_RETURN}
        ORDER BY score DESC
        SKIP $skip LIMIT $limit
      `;
    } else {
      const conditions: string[] = ['c.tenantId = $tenantId'];
      if (filter.stakeholderId) {
        params.stakeholderId = filter.stakeholderId;
        conditions.push('c.stakeholderId = $stakeholderId');
      }
      if (filter.status?.length) {
        params.statuses = filter.status;
        conditions.push('c.status IN $statuses');
      }
      const where = 'WHERE ' + conditions.join(' AND ');
      cypher = `
        MATCH (c:Case)
        ${where}
        RETURN ${CASE_RETURN}
        ORDER BY c.deployedAt DESC
        SKIP $skip LIMIT $limit
      `;
    }

    const r = await session.run(cypher, params);
    return r.records.map(rowToCase);
  } finally {
    await session.close();
  }
}

export async function findCase(tenantId: string, id: string): Promise<CaseRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:Case {id: $id})
       WHERE c.tenantId = $tenantId
       RETURN ${CASE_RETURN}`,
      { tenantId, id },
    );
    const rec = r.records[0];
    return rec ? rowToCase(rec) : null;
  } finally {
    await session.close();
  }
}

export async function findCaseByReportNo(tenantId: string, reportNo: string): Promise<CaseRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:Case {reportNo: $reportNo})
       WHERE c.tenantId = $tenantId
       RETURN ${CASE_RETURN}`,
      { tenantId, reportNo },
    );
    const rec = r.records[0];
    return rec ? rowToCase(rec) : null;
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createCase(tenantId: string, input: CaseInput): Promise<CaseRow> {
  const id = randomUUID();
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Verify stakeholder belongs to tenant and create Case
      const r = await tx.run(
        `MATCH (k:Stakeholder {id: $stakeholderId})
         WHERE k.tenantId = $tenantId
         CREATE (c:Case {
           id: $id,
           tenantId: $tenantId,
           reportNo: $reportNo,
           title: $title,
           trigger: $trigger,
           summary: $summary,
           status: coalesce($status, 'DRAFT'),
           verdict: 'PENDING',
           deployedAt: datetime($deployedAt),
           closedAt: null,
           stakeholderId: $stakeholderId,
           leadUserId: $leadUserId,
           createdAt: datetime(),
           updatedAt: datetime()
         })
         MERGE (c)-[:ASSESSED]->(k)
         WITH c
         CALL {
           WITH c
           OPTIONAL MATCH (u:User {id: $leadUserId})
           FOREACH (_ IN CASE WHEN u IS NULL THEN [] ELSE [1] END |
             MERGE (c)-[:LED_BY]->(u))
         }
         RETURN ${CASE_RETURN}`,
        {
          id,
          tenantId,
          reportNo: input.reportNo,
          title: input.title ?? null,
          trigger: input.trigger ?? null,
          summary: input.summary ?? null,
          status: input.status ?? null,
          deployedAt: input.deployedAt,
          stakeholderId: input.stakeholderId,
          leadUserId: input.leadUserId ?? null,
        },
      );

      if (!r.records[0]) {
        throw new GraphQLError('Stakeholder not found or access denied', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      return rowToCase(r.records[0]!);
    });
  } catch (err) {
    const errCode = (err as { code?: string }).code ?? '';
    if (errCode === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      throw new GraphQLError(`Case reportNo "${input.reportNo}" already exists for this tenant`, {
        extensions: { code: 'DUPLICATE_REPORT_NO' },
      });
    }
    throw err;
  } finally {
    await session.close();
  }
}

export async function updateCase(
  tenantId: string,
  id: string,
  input: CaseUpdateInput,
): Promise<CaseRow> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.trigger !== undefined) patch.trigger = input.trigger;
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.status !== undefined) patch.status = input.status;
      if (input.leadUserId !== undefined) patch.leadUserId = input.leadUserId;

      const r = await tx.run(
        `MATCH (c:Case {id: $id})
         WHERE c.tenantId = $tenantId
         SET c += $patch, c.updatedAt = datetime()
         RETURN ${CASE_RETURN}`,
        { id, tenantId, patch },
      );

      if (!r.records[0]) {
        throw new GraphQLError('Case not found', { extensions: { code: 'NOT_FOUND' } });
      }

      // Re-wire LED_BY if leadUserId changed
      if (input.leadUserId !== undefined) {
        await tx.run(
          `MATCH (c:Case {id: $id})-[r:LED_BY]->(:User)
           WHERE c.tenantId = $tenantId
           DELETE r`,
          { id, tenantId },
        );
        if (input.leadUserId) {
          await tx.run(
            `MATCH (c:Case {id: $id}), (u:User {id: $leadUserId})
             WHERE c.tenantId = $tenantId
             MERGE (c)-[:LED_BY]->(u)`,
            { id, tenantId, leadUserId: input.leadUserId },
          );
        }
      }

      return rowToCase(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export async function closeCase(
  tenantId: string,
  id: string,
  verdict: CloseVerdict,
): Promise<CaseRow> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:Case {id: $id})
       WHERE c.tenantId = $tenantId AND c.status = 'ACTIVE'
       SET c.status = 'CLOSED',
           c.verdict = $verdict,
           c.closedAt = datetime(),
           c.updatedAt = datetime()
       RETURN ${CASE_RETURN}`,
      { id, tenantId, verdict },
    );
    if (!r.records[0]) {
      throw new GraphQLError('Cannot close case unless ACTIVE', {
        extensions: { code: 'INVALID_TRANSITION' },
      });
    }
    return rowToCase(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function archiveCase(tenantId: string, id: string): Promise<CaseRow> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:Case {id: $id})
       WHERE c.tenantId = $tenantId AND c.status = 'CLOSED'
       SET c.status = 'ARCHIVED',
           c.updatedAt = datetime()
       RETURN ${CASE_RETURN}`,
      { id, tenantId },
    );
    if (!r.records[0]) {
      throw new GraphQLError('Cannot archive case unless CLOSED', {
        extensions: { code: 'INVALID_TRANSITION' },
      });
    }
    return rowToCase(r.records[0]!);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Artifact counts (single Cypher, no N+1)
// ---------------------------------------------------------------------------

export async function artifactCountsForCase(
  caseId: string,
  tenantId: string,
): Promise<ArtifactCounts> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:Case {id: $caseId})
       WHERE c.tenantId = $tenantId
       OPTIONAL MATCH (a:Artifact)-[:HAS_ARTIFACT]->(c)
       RETURN
         count(CASE WHEN a:Ioc          THEN 1 END) AS ioc,
         count(CASE WHEN a:File         THEN 1 END) AS file,
         count(CASE WHEN a:Process      THEN 1 END) AS process,
         count(CASE WHEN a:Network      THEN 1 END) AS network,
         count(CASE WHEN a:Registry     THEN 1 END) AS registry,
         count(CASE WHEN a:Persistence  THEN 1 END) AS persistence,
         count(CASE WHEN a:Account      THEN 1 END) AS account,
         count(CASE WHEN a:LogFinding   THEN 1 END) AS logFinding,
         count(CASE WHEN a:Memory       THEN 1 END) AS memory,
         count(CASE WHEN a:DetectionHit THEN 1 END) AS detectionHit,
         count(CASE WHEN a:Note         THEN 1 END) AS note`,
      { caseId, tenantId },
    );
    const rec = r.records[0];
    if (!rec) {
      return {
        ioc: 0, file: 0, process: 0, network: 0, registry: 0,
        persistence: 0, account: 0, logFinding: 0, memory: 0,
        detectionHit: 0, note: 0,
      };
    }
    return {
      ioc: Number(rec.get('ioc') ?? 0),
      file: Number(rec.get('file') ?? 0),
      process: Number(rec.get('process') ?? 0),
      network: Number(rec.get('network') ?? 0),
      registry: Number(rec.get('registry') ?? 0),
      persistence: Number(rec.get('persistence') ?? 0),
      account: Number(rec.get('account') ?? 0),
      logFinding: Number(rec.get('logFinding') ?? 0),
      memory: Number(rec.get('memory') ?? 0),
      detectionHit: Number(rec.get('detectionHit') ?? 0),
      note: Number(rec.get('note') ?? 0),
    };
  } finally {
    await session.close();
  }
}

export async function totalArtifactCount(caseId: string, tenantId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (c:Case {id: $caseId})
       WHERE c.tenantId = $tenantId
       OPTIONAL MATCH (a:Artifact)-[:HAS_ARTIFACT]->(c)
       RETURN count(a) AS n`,
      { caseId, tenantId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}
