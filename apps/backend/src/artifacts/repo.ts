import { randomUUID } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { getSession } from '../db/neo4j.js';
import type { ArtifactBaseRow, ArtifactType, Severity } from './types.js';
import { SEVERITY_RANK, TYPE_TO_LABEL } from './kinds.js';

// ---------------------------------------------------------------------------
// Return fragment
// ---------------------------------------------------------------------------

// Returns all node properties (including type-specific fields from SET a += $typeFields)
// plus labels for __resolveType. `props` is a map so all fields are accessible.
const ARTIFACT_RETURN = `
  properties(a) AS props,
  toString(a.observedAt) AS observedAt,
  toString(a.addedAt) AS addedAt,
  labels(a) AS __labels
`;

// ---------------------------------------------------------------------------
// Row helper
// ---------------------------------------------------------------------------

function rowToArtifact(rec: { get: (k: string) => unknown }): ArtifactBaseRow & Record<string, unknown> & { __labels: string[] } {
  const props = rec.get('props') as Record<string, unknown>;

  return {
    ...(props as Record<string, unknown>),
    // Override datetime fields with pre-serialized strings
    observedAt: (rec.get('observedAt') as string | null) ?? (props.observedAt as string),
    addedAt: (rec.get('addedAt') as string | null) ?? (props.addedAt as string),
    // Ensure ArtifactBaseRow required fields have correct types
    id: props.id as string,
    caseId: props.caseId as string,
    type: props.type as ArtifactType,
    hostAssetId: (props.hostAssetId as string | null) ?? null,
    severity: props.severity as Severity,
    confidence: props.confidence as ArtifactBaseRow['confidence'],
    notes: (props.notes as string | null) ?? null,
    tags: (props.tags as string[] | null) ?? [],
    addedByUserId: props.addedByUserId as string,
    __labels: (rec.get('__labels') as string[] | null) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listArtifactsByCase(
  tenantId: string,
  caseId: string,
  filter: { type?: string; severity?: string; limit: number; offset: number },
): Promise<Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }>> {
  const session = getSession();
  const typeLabel = filter.type ? TYPE_TO_LABEL[filter.type as ArtifactType] : null;

  try {
    const r = await session.run(
      `MATCH (a:Artifact)-[:HAS_ARTIFACT]->(c:Case {id: $caseId})
       WHERE c.tenantId = $tenantId
         AND a.tenantId = $tenantId
         AND ($typeLabel IS NULL OR $typeLabel IN labels(a))
         AND ($severity IS NULL OR a.severity = $severity)
       RETURN ${ARTIFACT_RETURN}
       ORDER BY a.observedAt DESC
       SKIP $skip LIMIT $limit`,
      {
        tenantId,
        caseId,
        typeLabel: typeLabel ?? null,
        severity: filter.severity ?? null,
        skip: BigInt(filter.offset),
        limit: BigInt(filter.limit),
      },
    );
    return r.records.map(rowToArtifact);
  } finally {
    await session.close();
  }
}

export async function listFindings(
  tenantId: string,
  caseId: string,
  limit: number,
): Promise<Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }>> {
  const session = getSession();
  // High-confidence + high-severity subset, severity-rank ordered
  const highSeverities = Object.entries(SEVERITY_RANK)
    .filter(([, rank]) => rank >= SEVERITY_RANK.HIGH)
    .map(([s]) => s);

  try {
    const r = await session.run(
      `MATCH (a:Artifact)-[:HAS_ARTIFACT]->(c:Case {id: $caseId})
       WHERE c.tenantId = $tenantId
         AND a.tenantId = $tenantId
         AND a.confidence = 'HIGH'
         AND a.severity IN $highSeverities
       RETURN ${ARTIFACT_RETURN}
       ORDER BY
         CASE a.severity
           WHEN 'CRITICAL' THEN 4
           WHEN 'HIGH'     THEN 3
           ELSE 0
         END DESC,
         a.observedAt DESC
       LIMIT $limit`,
      {
        tenantId,
        caseId,
        highSeverities,
        limit: BigInt(limit),
      },
    );
    return r.records.map(rowToArtifact);
  } finally {
    await session.close();
  }
}

export async function listTimeline(
  tenantId: string,
  caseId: string,
  limit: number,
): Promise<Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }>> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Artifact)-[:HAS_ARTIFACT]->(c:Case {id: $caseId})
       WHERE c.tenantId = $tenantId
         AND a.tenantId = $tenantId
       RETURN ${ARTIFACT_RETURN}
       ORDER BY a.observedAt ASC
       LIMIT $limit`,
      { tenantId, caseId, limit: BigInt(limit) },
    );
    return r.records.map(rowToArtifact);
  } finally {
    await session.close();
  }
}

export async function findArtifact(
  tenantId: string,
  id: string,
): Promise<{ row: ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }; labels: string[] } | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Artifact {id: $id})
       WHERE a.tenantId = $tenantId
       RETURN ${ARTIFACT_RETURN}`,
      { tenantId, id },
    );
    const rec = r.records[0];
    if (!rec) return null;
    const row = rowToArtifact(rec);
    return { row, labels: row.__labels };
  } finally {
    await session.close();
  }
}

export async function deleteArtifact(tenantId: string, id: string): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (a:Artifact {id: $id})
       WHERE a.tenantId = $tenantId
       DETACH DELETE a
       RETURN count(a) AS deleted`,
      { tenantId, id },
    );
    return Number(r.records[0]?.get('deleted') ?? 0) > 0;
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// createArtifactNode — shared helper used by all per-type resolvers (T7-T9)
// ---------------------------------------------------------------------------

export interface CreateArtifactBase {
  type: ArtifactType;
  observedAt: string;
  hostAssetId: string | null;
  severity: Severity;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  notes: string | null;
  tags: string[];
  addedByUserId: string;
}

export interface CreateArtifactSpec {
  /** Multi-label applied alongside :Artifact — closed enum from this module, never user input */
  typeLabel: string;
  /** Type-specific fields written via SET a += $typeFields */
  typeFields: Record<string, unknown>;
}

export async function createArtifactNode(
  tenantId: string,
  caseId: string,
  base: CreateArtifactBase,
  spec: CreateArtifactSpec,
): Promise<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }> {
  const id = randomUUID();
  const session = getSession();

  try {
    return await session.executeWrite(async (tx) => {
      // typeLabel comes from TYPE_TO_LABEL (closed enum) — never user input, backtick injection is safe
      const r = await tx.run(
        `MATCH (c:Case {id: $caseId})
         WHERE c.tenantId = $tenantId AND c.status IN ['DRAFT', 'ACTIVE']
         CREATE (a:Artifact)
         SET a:\`${spec.typeLabel}\`,
             a.id = $id,
             a.tenantId = $tenantId,
             a.caseId = $caseId,
             a.type = $type,
             a.observedAt = datetime($observedAt),
             a.severity = $severity,
             a.confidence = $confidence,
             a.notes = $notes,
             a.tags = $tags,
             a.addedByUserId = $addedByUserId,
             a.addedAt = datetime(),
             a += $typeFields
         MERGE (c)-[:HAS_ARTIFACT]->(a)
         WITH a, $hostAssetId AS hostId
         FOREACH (h IN CASE WHEN hostId IS NULL THEN [] ELSE [hostId] END |
           MATCH (asset:Asset {id: h})
           WHERE asset.tenantId = $tenantId
           MERGE (a)-[:ON_HOST]->(asset))
         RETURN ${ARTIFACT_RETURN}`,
        {
          id,
          tenantId,
          caseId,
          type: base.type,
          observedAt: base.observedAt,
          severity: base.severity,
          confidence: base.confidence,
          notes: base.notes ?? null,
          tags: base.tags,
          addedByUserId: base.addedByUserId,
          typeFields: spec.typeFields,
          hostAssetId: base.hostAssetId ?? null,
        },
      );

      if (!r.records[0]) {
        throw new GraphQLError('Cannot add artifact to non-active case', {
          extensions: { code: 'INVALID_CASE_STATE' },
        });
      }

      return rowToArtifact(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// createArtifactNodesBulk — all IOCs in ONE executeWrite (atomic)
// ---------------------------------------------------------------------------

export interface BulkCreateRequest {
  base: CreateArtifactBase;
  spec: CreateArtifactSpec;
}

export async function createArtifactNodesBulk(
  tenantId: string,
  caseId: string,
  requests: BulkCreateRequest[],
): Promise<Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }>> {
  if (requests.length === 0) return [];
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Single case-status check upfront — atomic with all artifact creates
      const caseCheck = await tx.run(
        `MATCH (c:Case {id: $caseId})
         WHERE c.tenantId = $tenantId AND c.status IN ['DRAFT', 'ACTIVE']
         RETURN c.id AS id`,
        { tenantId, caseId },
      );
      if (caseCheck.records.length === 0) {
        throw new GraphQLError('Cannot add artifact to non-active case', {
          extensions: { code: 'INVALID_CASE_STATE' },
        });
      }

      const out: Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }> = [];
      for (const req of requests) {
        const result = await tx.run(
          `MATCH (c:Case {id: $caseId, tenantId: $tenantId})
           CREATE (a:Artifact)
           SET a:\`${req.spec.typeLabel}\`,
               a.id = randomUUID(),
               a.tenantId = $tenantId,
               a.caseId = $caseId,
               a.type = $type,
               a.observedAt = datetime($observedAt),
               a.severity = $severity,
               a.confidence = $confidence,
               a.notes = $notes,
               a.tags = $tags,
               a.addedByUserId = $addedByUserId,
               a.addedAt = datetime(),
               a += $typeFields
           MERGE (a)-[:HAS_ARTIFACT]->(c)
           WITH a, $hostAssetId AS hostId
           FOREACH (h IN CASE WHEN hostId IS NULL THEN [] ELSE [hostId] END |
             MATCH (asset:Asset {id: h}) WHERE asset.tenantId = $tenantId
             MERGE (a)-[:ON_HOST]->(asset))
           RETURN properties(a) AS props,
                  toString(a.observedAt) AS observedAt,
                  toString(a.addedAt) AS addedAt,
                  labels(a) AS __labels`,
          {
            tenantId,
            caseId,
            type: req.base.type,
            observedAt: req.base.observedAt,
            severity: req.base.severity,
            confidence: req.base.confidence,
            notes: req.base.notes ?? null,
            tags: req.base.tags,
            addedByUserId: req.base.addedByUserId,
            hostAssetId: req.base.hostAssetId ?? null,
            typeFields: req.spec.typeFields,
          },
        );
        out.push(rowToArtifact(result.records[0]!));
      }
      return out;
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Auto-link helpers — best-effort; no throw if target node missing
// ---------------------------------------------------------------------------

export async function linkIocToGlobalIoc(artifactId: string, value: string): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (a:Artifact:Ioc {id: $artifactId})
         OPTIONAL MATCH (g:IOC {value: $value})
         FOREACH (i IN CASE WHEN g IS NULL THEN [] ELSE [g] END |
           MERGE (a)-[:MATCHES_IOC]->(i))`,
        { artifactId, value },
      );
    });
  } finally {
    await session.close();
  }
}

export async function linkFileToHash(artifactId: string, sha256: string): Promise<void> {
  // Best-effort: no :Hash label exists in the schema yet — this is a no-op until one is added.
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (a:Artifact:File {id: $artifactId})
         OPTIONAL MATCH (h:Hash {sha256: $sha256})
         FOREACH (x IN CASE WHEN h IS NULL THEN [] ELSE [h] END |
           MERGE (a)-[:MATCHES_HASH]->(x))`,
        { artifactId, sha256 },
      );
    });
  } finally {
    await session.close();
  }
}

export async function linkProcessToTtp(artifactId: string, ttpIds: string[]): Promise<void> {
  if (ttpIds.length === 0) return;
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (a:Artifact:Process {id: $artifactId})
         UNWIND $ttpIds AS tid
         OPTIONAL MATCH (t:AttackPattern {id: tid})
         FOREACH (x IN CASE WHEN t IS NULL THEN [] ELSE [t] END |
           MERGE (a)-[:HINTS_AT_TTP]->(x))`,
        { artifactId, ttpIds },
      );
    });
  } finally {
    await session.close();
  }
}

export async function linkDetectionHitToRule(artifactId: string, ruleId: string): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (a:Artifact:DetectionHit {id: $artifactId})
         OPTIONAL MATCH (r:DetectionRule {id: $ruleId})
         FOREACH (x IN CASE WHEN r IS NULL THEN [] ELSE [r] END |
           MERGE (a)-[:TRIGGERED_BY]->(x))`,
        { artifactId, ruleId },
      );
    });
  } finally {
    await session.close();
  }
}
