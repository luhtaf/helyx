// Top-level orchestrator: gather IOCs from a hunt's snapshot, run all
// generators, persist results as :DetectionRule with :GENERATED edge from
// hunt + :DERIVED_FROM edge to source artifacts.
//
// Snapshot shape (from HelyxGraph getSnapshot):
//   { nodes: [{id, type, entityId, ...}], edges: [...], viewport: {} }
//
// Strategy: walk nodes for type=Case → fetch all artifacts of that case →
// categorize per generator input (file hashes, IPs, domains, processes,
// registries) → run YARA/Suricata/Sigma → return generated rules + stats.

import { getSession } from '../db/neo4j.js';
import { upsertRulesBulk } from '../rules/repo.js';
import { newId } from '../utils/uuid.js';
import { generateYara } from './yara.js';
import { generateSuricata } from './suricata.js';
import { generateSigma } from './sigma.js';
import type { GenerateStats, GeneratedRule, RuleSeed } from './types.js';

interface HuntSnapshotNode {
  id: string;
  type: string;
  entityId: string;
  label?: string;
  data?: Record<string, unknown>;
}

interface HuntSnapshot {
  nodes: HuntSnapshotNode[];
  edges?: unknown[];
}

// Fetch artifacts attached to all Cases in the snapshot. Returns one flat
// list with type-specific fields hydrated.
async function gatherArtifacts(
  tenantId: string,
  caseIds: string[],
): Promise<Array<{ id: string; type: string; data: Record<string, unknown> }>> {
  if (caseIds.length === 0) return [];
  const session = getSession();
  try {
    const r = await session.run(
      `UNWIND $ids AS cid
       MATCH (c:Case {id: cid, tenantId: $tenantId})-[:HAS_ARTIFACT]->(a:Artifact)
       RETURN a.id AS id, a.type AS type, properties(a) AS data`,
      { tenantId, ids: caseIds },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      type: rec.get('type') as string,
      data: (rec.get('data') as Record<string, unknown>) ?? {},
    }));
  } finally {
    await session.close();
  }
}

// Fetch MITRE techniques attached to AttackPattern nodes in the snapshot.
async function gatherTechniqueIds(snapshot: HuntSnapshot): Promise<string[]> {
  // Snapshot's AttackPattern node entityId may be the local UUID; look up
  // externalId (the T-code).
  const apNodes = snapshot.nodes.filter((n) => n.type === 'AttackPattern' || n.type === 'CWE');
  if (apNodes.length === 0) return [];
  const session = getSession();
  try {
    const r = await session.run(
      `UNWIND $ids AS aid
       MATCH (ap:AttackPattern {id: aid})
       RETURN coalesce(ap.externalId, ap.id) AS techId`,
      { ids: apNodes.map((n) => n.entityId) },
    );
    return r.records.map((rec) => rec.get('techId') as string).filter(Boolean);
  } finally {
    await session.close();
  }
}

// Categorize artifacts into generator-friendly buckets.
function buildSeed(
  artifacts: Array<{ id: string; type: string; data: Record<string, unknown> }>,
  techniqueIds: string[],
): RuleSeed {
  const seed: RuleSeed = {
    fileHashes: [],
    ips: [],
    domains: [],
    urls: [],
    processes: [],
    registries: [],
    techniqueIds,
  };
  for (const a of artifacts) {
    const d = a.data;
    switch (a.type) {
      case 'FILE':
        if (d.md5 || d.sha1 || d.sha256) {
          seed.fileHashes.push({
            md5: (d.md5 as string) ?? null,
            sha1: (d.sha1 as string) ?? null,
            sha256: (d.sha256 as string) ?? null,
            filename: (d.filename as string) ?? null,
            behavior: (d.behavior as string[]) ?? [],
          });
        }
        break;
      case 'IOC': {
        const v = d.value as string | undefined;
        if (!v) break;
        const t = d.iocType as string | undefined;
        if (t === 'IP') seed.ips.push({ value: v });
        else if (t === 'DOMAIN') seed.domains.push({ value: v });
        else if (t === 'URL') seed.urls.push({ value: v });
        else if (t === 'HASH') seed.fileHashes.push({ sha256: v, filename: 'ioc-hash' });
        break;
      }
      case 'NETWORK':
        if (d.dstIp) seed.ips.push({ value: d.dstIp as string });
        break;
      case 'PROCESS':
        if (d.name) seed.processes.push({
          name: d.name as string,
          commandLine: (d.commandLine as string) ?? null,
          parentName: (d.parentName as string) ?? null,
        });
        break;
      case 'REGISTRY':
        if (d.keyPath) seed.registries.push({
          hive: (d.hive as string) ?? 'HKLM',
          keyPath: d.keyPath as string,
          valueName: (d.valueName as string) ?? null,
        });
        break;
    }
  }
  return seed;
}

function safeContextName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
}

export async function generateRulesFromHunt(
  tenantId: string,
  userId: string,
  hunt: { id: string; name: string; graphSnapshot: string | null },
): Promise<{ rules: GeneratedRule[]; stats: GenerateStats }> {
  if (!hunt.graphSnapshot) {
    return { rules: [], stats: { yaraCount: 0, suricataCount: 0, sigmaCount: 0, skipped: [{ reason: 'hunt has no graph snapshot', count: 1 }] } };
  }

  const snapshot: HuntSnapshot = JSON.parse(hunt.graphSnapshot);
  const caseIds = snapshot.nodes.filter((n) => n.type === 'Case').map((n) => n.entityId);
  const techniqueIds = await gatherTechniqueIds(snapshot);
  const artifacts = await gatherArtifacts(tenantId, caseIds);

  if (artifacts.length === 0 && techniqueIds.length === 0) {
    return { rules: [], stats: { yaraCount: 0, suricataCount: 0, sigmaCount: 0, skipped: [{ reason: 'no artifacts or TTPs in hunt', count: 1 }] } };
  }

  const seed = buildSeed(artifacts, techniqueIds);
  const ctxName = safeContextName(hunt.name);

  const yaraRules = generateYara(seed, ctxName);
  const suricataRules = generateSuricata(seed, ctxName);
  const sigmaRules = generateSigma(seed, ctxName);

  const all = [...yaraRules, ...suricataRules, ...sigmaRules];

  // Persist as :DetectionRule + link via :GENERATED from hunt.
  if (all.length > 0) {
    const session = getSession();
    try {
      await session.executeWrite(async (tx) => {
        const rows = all.map((r) => ({
          id: newId(),
          kind: r.kind,
          name: r.name,
          description: r.description,
          content: r.content,
          tags: r.tags,
          source: 'helyx-generated' as const,
          sourceRef: `${hunt.id}:${r.name}`,
        }));
        await tx.run(
          `MATCH (u:User {id: $userId})
           MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
           UNWIND $rows AS row
           CREATE (r:DetectionRule {
             id: row.id, tenantId: $tenantId, kind: row.kind, name: row.name,
             description: row.description, content: row.content,
             tags: row.tags, source: row.source, sourceRef: row.sourceRef,
             status: 'DRAFT',
             createdAt: datetime(), updatedAt: datetime()
           })
           CREATE (u)-[:CREATED]->(r)
           CREATE (h)-[:GENERATED]->(r)`,
          { tenantId, userId, huntId: hunt.id, rows },
        );
      });
    } finally {
      await session.close();
    }
  }

  return {
    rules: all,
    stats: {
      yaraCount: yaraRules.length,
      suricataCount: suricataRules.length,
      sigmaCount: sigmaRules.length,
      skipped: [],
    },
  };
}

// Re-exports for convenience.
export { upsertRulesBulk };
export type { GeneratedRule, GenerateStats, RuleSeed };
