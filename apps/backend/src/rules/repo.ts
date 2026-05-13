import { getSession } from '../db/neo4j.js';
import { newId } from '../utils/uuid.js';
import { createHash, randomUUID } from 'node:crypto';
import { GraphQLError } from 'graphql';
import type {
  CreateRuleInput,
  DetectionRuleRow,
  ReleaseTier,
  RuleFilter,
  RuleKind,
  RuleSource,
  RuleStatus,
  UpdateRuleInput,
} from './types.js';
import { logAudit } from '../audits/log.js';

// F2 — sha256 of rule.content at approval time. Stable hex hash.
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const RULE_RETURN = `
  r.id AS id, r.tenantId AS tenantId, r.kind AS kind,
  r.name AS name, r.description AS description, r.content AS content,
  coalesce(r.tags, []) AS tags,
  r.source AS source, r.sourceRef AS sourceRef, r.status AS status,
  coalesce(r.releaseTier, 'internal') AS releaseTier,
  r.approvedByUserId AS approvedByUserId,
  toString(r.approvedAt) AS approvedAt,
  r.approvalContentHash AS approvalContentHash,
  head([(u:User)-[:CREATED]->(r) | u.id]) AS createdByUserId,
  toString(r.createdAt) AS createdAt, toString(r.updatedAt) AS updatedAt,
  size([(r)-[:DERIVED_FROM]->() | 1]) AS derivedFromArtifactCount,
  size([(r)-[:DETECTS]->() | 1]) AS detectsTechniqueCount,
  size([(:Hunt)-[:GENERATED]->(r) | 1]) AS generatedByHuntCount
`;

function rowToRule(rec: { get: (k: string) => unknown }): DetectionRuleRow {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    kind: rec.get('kind') as RuleKind,
    name: rec.get('name') as string,
    description: (rec.get('description') as string | null) ?? null,
    content: rec.get('content') as string,
    tags: (rec.get('tags') as string[]) ?? [],
    source: rec.get('source') as RuleSource,
    sourceRef: (rec.get('sourceRef') as string | null) ?? null,
    status: rec.get('status') as RuleStatus,
    releaseTier: rec.get('releaseTier') as ReleaseTier,
    approvedByUserId: (rec.get('approvedByUserId') as string | null) ?? null,
    approvedAt: (rec.get('approvedAt') as string | null) ?? null,
    approvalContentHash: (rec.get('approvalContentHash') as string | null) ?? null,
    createdByUserId: (rec.get('createdByUserId') as string | null) ?? null,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
    derivedFromArtifactCount: Number(rec.get('derivedFromArtifactCount') ?? 0),
    detectsTechniqueCount: Number(rec.get('detectsTechniqueCount') ?? 0),
    generatedByHuntCount: Number(rec.get('generatedByHuntCount') ?? 0),
  };
}

// F2 — Approve a rule for release. Captures sha256(content) so we can
// detect post-approval edits ("stale approval"). Per the Copilot
// finding, edits after approval drop the approval — re-approval needed.
// Audit chain via :RuleApproval node (m018) + AuditEvent.
export async function approveRule(
  tenantId: string,
  userId: string,
  ruleId: string,
): Promise<DetectionRuleRow> {
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx) => {
      // Fetch content first to compute hash atomically with approval.
      const cur = await tx.run(
        `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId})
         RETURN r.content AS content,
                r.approvedByUserId AS approvedByUserId,
                toString(r.approvedAt) AS approvedAt`,
        { ruleId, tenantId },
      );
      const rec = cur.records[0];
      if (!rec) throw new GraphQLError('rule not found', { extensions: { code: 'NOT_FOUND' } });
      const beforeApproved = (rec.get('approvedByUserId') as string | null) ?? null;
      const contentHash = sha256(rec.get('content') as string);

      const upd = await tx.run(
        `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId})
         SET r.approvedByUserId = $userId,
             r.approvedAt = datetime(),
             r.approvalContentHash = $hash,
             r.updatedAt = datetime()
         CREATE (a:RuleApproval {
           id: randomUUID(), tenantId: $tenantId, ruleId: $ruleId,
           action: 'approve', actorUserId: $userId,
           contentHash: $hash, ts: datetime()
         })
         RETURN ${RULE_RETURN}`,
        { ruleId, tenantId, userId, hash: contentHash },
      );
      return { row: rowToRule(upd.records[0]!), wasReApprove: beforeApproved !== null };
    });
    await logAudit(
      tenantId, userId, 'rule.approve',
      { type: 'DetectionRule', id: ruleId },
      result.wasReApprove ? { previouslyApproved: true } : null,
      { approvedByUserId: userId, approvalContentHash: result.row.approvalContentHash },
    );
    return result.row;
  } finally {
    await session.close();
  }
}

// F2 — Revoke approval. Clears the 3 approval fields.
export async function unapproveRule(
  tenantId: string,
  userId: string,
  ruleId: string,
): Promise<DetectionRuleRow> {
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx) => {
      const cur = await tx.run(
        `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId})
         RETURN r.approvedByUserId AS approvedByUserId,
                r.approvalContentHash AS approvalContentHash`,
        { ruleId, tenantId },
      );
      const rec = cur.records[0];
      if (!rec) throw new GraphQLError('rule not found', { extensions: { code: 'NOT_FOUND' } });
      const before = {
        approvedByUserId: (rec.get('approvedByUserId') as string | null) ?? null,
        approvalContentHash: (rec.get('approvalContentHash') as string | null) ?? null,
      };
      const upd = await tx.run(
        `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId})
         REMOVE r.approvedByUserId, r.approvedAt, r.approvalContentHash
         SET r.updatedAt = datetime()
         CREATE (a:RuleApproval {
           id: randomUUID(), tenantId: $tenantId, ruleId: $ruleId,
           action: 'unapprove', actorUserId: $userId, ts: datetime()
         })
         RETURN ${RULE_RETURN}`,
        { ruleId, tenantId, userId },
      );
      return { row: rowToRule(upd.records[0]!), before };
    });
    await logAudit(
      tenantId, userId, 'rule.unapprove',
      { type: 'DetectionRule', id: ruleId },
      result.before,
      { approvedByUserId: null, approvalContentHash: null },
    );
    return result.row;
  } finally {
    await session.close();
  }
}

// F1 — Set the release tier on a DetectionRule. Logs audit chain via
// :ReleaseTierChange node + emits a tenant-wide audit event.
// Tenant-guarded; throws NOT_FOUND if cross-tenant or missing.
export async function setRuleReleaseTier(
  tenantId: string,
  userId: string,
  ruleId: string,
  tier: ReleaseTier,
): Promise<DetectionRuleRow> {
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx) => {
      // Read current tier first (for audit before/after)
      const current = await tx.run(
        `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId})
         RETURN coalesce(r.releaseTier, 'internal') AS tier`,
        { ruleId, tenantId },
      );
      const before = current.records[0]?.get('tier') as ReleaseTier | undefined;
      if (!before) {
        throw new GraphQLError('rule not found', { extensions: { code: 'NOT_FOUND' } });
      }
      // No-op if tier unchanged — return current row, skip audit
      if (before === tier) {
        const r = await tx.run(
          `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId}) RETURN ${RULE_RETURN}`,
          { ruleId, tenantId },
        );
        return { row: rowToRule(r.records[0]!), changed: false, before };
      }
      // Update + write :ReleaseTierChange audit node
      const upd = await tx.run(
        `MATCH (r:DetectionRule {id: $ruleId, tenantId: $tenantId})
         SET r.releaseTier = $tier, r.updatedAt = datetime()
         CREATE (c:ReleaseTierChange {
           id: randomUUID(), tenantId: $tenantId,
           ruleId: $ruleId, fromTier: $before, toTier: $tier,
           changedByUserId: $userId, ts: datetime()
         })
         RETURN ${RULE_RETURN}`,
        { ruleId, tenantId, tier, before, userId },
      );
      return { row: rowToRule(upd.records[0]!), changed: true, before };
    });
    // Audit (best-effort, outside tx)
    if (result.changed) {
      await logAudit(
        tenantId, userId, 'rule.release_tier_change',
        { type: 'DetectionRule', id: ruleId },
        { releaseTier: result.before },
        { releaseTier: tier },
      );
    }
    return result.row;
  } finally {
    await session.close();
  }
}

export async function createRule(
  tenantId: string,
  userId: string,
  input: CreateRuleInput,
): Promise<DetectionRuleRow> {
  const id = newId();
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (u:User {id: $userId})
         CREATE (r:DetectionRule {
           id: $id, tenantId: $tenantId, kind: $kind, name: $name,
           description: $description, content: $content,
           tags: $tags, source: $source, sourceRef: $sourceRef,
           status: $status, createdAt: datetime(), updatedAt: datetime()
         })
         CREATE (u)-[:CREATED]->(r)`,
        {
          id,
          tenantId,
          userId,
          kind: input.kind,
          name: input.name,
          description: input.description ?? null,
          content: input.content,
          tags: input.tags ?? [],
          source: input.source ?? 'manual',
          sourceRef: input.sourceRef ?? null,
          status: input.status ?? 'DRAFT',
        },
      );

      // Derived-from artifact provenance — rule "indicator" semantic.
      if (input.derivedFromArtifactIds?.length) {
        await tx.run(
          `MATCH (r:DetectionRule {id: $id, tenantId: $tenantId})
           UNWIND $aIds AS aId
           MATCH (a:Artifact {id: aId, tenantId: $tenantId})
           MERGE (r)-[:DERIVED_FROM]->(a)`,
          { id, tenantId, aIds: input.derivedFromArtifactIds },
        );
      }

      // MITRE technique coverage.
      if (input.detectsTechniqueIds?.length) {
        await tx.run(
          `MATCH (r:DetectionRule {id: $id, tenantId: $tenantId})
           UNWIND $tIds AS tId
           MATCH (ap:AttackPattern {id: tId})
           MERGE (r)-[:DETECTS]->(ap)`,
          { id, tenantId, tIds: input.detectsTechniqueIds },
        );
      }

      const r = await tx.run(
        `MATCH (r:DetectionRule {id: $id}) RETURN ${RULE_RETURN}`,
        { id },
      );
      return rowToRule(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export interface RuleHuntRef {
  id: string;
  name: string;
  status: string;
}

// Hunts that produced this rule via :GENERATED. Tenant-scoped via the
// rule lookup (rule already validated by caller).
export async function listHuntsThatGenerated(
  tenantId: string,
  ruleId: string,
  limit: number,
): Promise<RuleHuntRef[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {tenantId: $tenantId})-[:GENERATED]->(r:DetectionRule {id: $ruleId, tenantId: $tenantId})
       RETURN h.id AS id, h.name AS name, coalesce(h.status, 'ACTIVE') AS status
       ORDER BY h.createdAt DESC
       LIMIT toInteger($limit)`,
      { tenantId, ruleId, limit: BigInt(limit) },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      name: rec.get('name') as string,
      status: rec.get('status') as string,
    }));
  } finally {
    await session.close();
  }
}

export async function findRuleById(
  tenantId: string,
  id: string,
): Promise<DetectionRuleRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:DetectionRule {id: $id, tenantId: $tenantId}) RETURN ${RULE_RETURN}`,
      { id, tenantId },
    );
    const rec = r.records[0];
    return rec ? rowToRule(rec) : null;
  } finally {
    await session.close();
  }
}

export async function listRules(
  tenantId: string,
  filter: RuleFilter,
  page: number,
  perPage: number,
): Promise<DetectionRuleRow[]> {
  const session = getSession();
  try {
    const conditions: string[] = ['r.tenantId = $tenantId'];
    const params: Record<string, unknown> = {
      tenantId,
      skip: BigInt(Math.max(0, (page - 1) * perPage)),
      limit: BigInt(perPage),
    };
    if (filter.kind) { conditions.push('r.kind = $kind'); params.kind = filter.kind; }
    if (filter.status) { conditions.push('r.status = $status'); params.status = filter.status; }
    if (filter.source) { conditions.push('r.source = $source'); params.source = filter.source; }
    if (filter.tag) { conditions.push('$tag IN coalesce(r.tags, [])'); params.tag = filter.tag; }

    let cypher: string;
    if (filter.search) {
      params.search = filter.search;
      // Fulltext search via index, then filter by tenant + others.
      cypher = `
        CALL db.index.fulltext.queryNodes('detection_rule_search', $search) YIELD node AS r, score
        WHERE ${conditions.join(' AND ')}
        RETURN ${RULE_RETURN}
        ORDER BY score DESC
        SKIP $skip LIMIT $limit
      `;
    } else {
      cypher = `
        MATCH (r:DetectionRule)
        WHERE ${conditions.join(' AND ')}
        RETURN ${RULE_RETURN}
        ORDER BY r.updatedAt DESC
        SKIP $skip LIMIT $limit
      `;
    }
    const r = await session.run(cypher, params);
    return r.records.map(rowToRule);
  } finally {
    await session.close();
  }
}

export async function countRules(tenantId: string, filter: RuleFilter): Promise<number> {
  const session = getSession();
  try {
    const conditions: string[] = ['r.tenantId = $tenantId'];
    const params: Record<string, unknown> = { tenantId };
    if (filter.kind) { conditions.push('r.kind = $kind'); params.kind = filter.kind; }
    if (filter.status) { conditions.push('r.status = $status'); params.status = filter.status; }
    if (filter.source) { conditions.push('r.source = $source'); params.source = filter.source; }
    if (filter.tag) { conditions.push('$tag IN coalesce(r.tags, [])'); params.tag = filter.tag; }

    let cypher: string;
    if (filter.search) {
      params.search = filter.search;
      cypher = `
        CALL db.index.fulltext.queryNodes('detection_rule_search', $search) YIELD node AS r
        WHERE ${conditions.join(' AND ')}
        RETURN count(r) AS n
      `;
    } else {
      cypher = `MATCH (r:DetectionRule) WHERE ${conditions.join(' AND ')} RETURN count(r) AS n`;
    }
    const r = await session.run(cypher, params);
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

export async function updateRule(
  tenantId: string,
  id: string,
  input: UpdateRuleInput,
): Promise<DetectionRuleRow | null> {
  const session = getSession();
  try {
    const sets: string[] = ['r.updatedAt = datetime()'];
    const params: Record<string, unknown> = { id, tenantId };
    if (input.name !== undefined) { sets.push('r.name = $name'); params.name = input.name; }
    if (input.description !== undefined) { sets.push('r.description = $description'); params.description = input.description; }
    if (input.content !== undefined) { sets.push('r.content = $content'); params.content = input.content; }
    if (input.tags !== undefined) { sets.push('r.tags = $tags'); params.tags = input.tags; }
    if (input.status !== undefined) { sets.push('r.status = $status'); params.status = input.status; }

    const r = await session.run(
      `MATCH (r:DetectionRule {id: $id, tenantId: $tenantId})
       SET ${sets.join(', ')}
       RETURN ${RULE_RETURN}`,
      params,
    );
    const rec = r.records[0];
    return rec ? rowToRule(rec) : null;
  } finally {
    await session.close();
  }
}

export async function deleteRule(tenantId: string, id: string): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:DetectionRule {id: $id, tenantId: $tenantId})
       DETACH DELETE r
       RETURN count(r) AS deleted`,
      { id, tenantId },
    );
    return Number(r.records[0]?.get('deleted') ?? 0) > 0;
  } finally {
    await session.close();
  }
}

// Bulk upsert — used by Sigma library import + future STIX importer.
// Idempotent on (tenantId, sourceRef) for a given source. Returns count.
export async function upsertRulesBulk(
  tenantId: string,
  rules: Array<{
    kind: RuleKind;
    name: string;
    description: string | null;
    content: string;
    tags: string[];
    source: RuleSource;
    sourceRef: string;
    detectsTechniqueIds?: string[];
  }>,
): Promise<number> {
  if (rules.length === 0) return 0;
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      const rows = rules.map((r) => ({ ...r, id: newId() }));
      const result = await tx.run(
        `UNWIND $rows AS row
         MERGE (r:DetectionRule {tenantId: $tenantId, source: row.source, sourceRef: row.sourceRef})
         ON CREATE SET
           r.id = row.id, r.kind = row.kind, r.name = row.name,
           r.description = row.description, r.content = row.content,
           r.tags = row.tags, r.status = 'ACTIVE',
           r.createdAt = datetime(), r.updatedAt = datetime()
         ON MATCH SET
           r.name = row.name, r.description = row.description,
           r.content = row.content, r.tags = row.tags,
           r.updatedAt = datetime()
         RETURN count(r) AS n`,
        { tenantId, rows },
      );

      // Best-effort technique linking — silently skip techniques not in catalog.
      const withTech = rules.filter((r) => r.detectsTechniqueIds?.length);
      if (withTech.length) {
        const techRows = withTech.flatMap((r) =>
          (r.detectsTechniqueIds ?? []).map((tId) => ({
            sourceRef: r.sourceRef,
            source: r.source,
            tId,
          })),
        );
        await tx.run(
          `UNWIND $rows AS row
           MATCH (rule:DetectionRule {tenantId: $tenantId, source: row.source, sourceRef: row.sourceRef})
           MATCH (ap:AttackPattern {externalId: row.tId})
           MERGE (rule)-[:DETECTS]->(ap)`,
          { tenantId, rows: techRows },
        );
      }

      return Number(result.records[0]?.get('n') ?? 0);
    });
  } finally {
    await session.close();
  }
}
