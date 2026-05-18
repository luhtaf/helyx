import { getSession } from '../db/neo4j.js';
import type { ReleaseTier } from '../cti/kinds.js';

// Hunt → raw indicator material, for OpenIOC + plain-list export
// (reputation-feed / blocklist shape). NOT the STIX path: STIX exports
// indicators derived from F2-*approved DetectionRules*; this exports
// the actual observed IOC artifacts in the hunt's cases. Same source
// rows as generateRulesFromHunt's gather, but a different downstream
// transform (indicator records, not generator seed), so kept separate.

export type IocKind =
  | 'md5' | 'sha1' | 'sha256' | 'ip' | 'domain' | 'url' | 'email'
  | 'process' | 'registry';

export interface HuntIoc {
  kind: IocKind;
  value: string;
  fromArtifactId: string;
}

// F1 release-tier → TLP handling label (CLAUDE.md F1 table). Stamped as
// a header so a downloaded list carries its handling caveat. Distinct
// from stix.ts TIER_TO_TLP (that maps to OASIS marking objects; this is
// the human label).
const TLP_LABEL: Record<ReleaseTier, string> = {
  'public': 'TLP:WHITE',
  'cross-agency': 'TLP:GREEN',
  'sectoral': 'TLP:AMBER',
  'internal': 'TLP:RED',
};

interface HuntLite {
  id: string;
  name: string;
  graphSnapshot: string | null;
  releaseTier: ReleaseTier;
}

interface SnapshotNode { type: string; entityId: string }

function pushUnique(
  acc: HuntIoc[], seen: Set<string>, kind: IocKind, value: unknown, fromId: string,
): void {
  if (typeof value !== 'string') return;
  const v = value.trim();
  if (!v) return;
  const dedupeKey = `${kind}:${v.toLowerCase()}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  acc.push({ kind, value: v, fromArtifactId: fromId });
}

export interface HuntIocCollection {
  iocs: HuntIoc[];
  tlp: string;
  huntName: string;
}

export async function collectHuntIocs(
  tenantId: string,
  hunt: HuntLite,
): Promise<HuntIocCollection> {
  const tlp = TLP_LABEL[hunt.releaseTier] ?? 'TLP:RED';
  if (!hunt.graphSnapshot) return { iocs: [], tlp, huntName: hunt.name };

  let caseIds: string[] = [];
  try {
    const snap = JSON.parse(hunt.graphSnapshot) as { nodes?: SnapshotNode[] };
    caseIds = (snap.nodes ?? [])
      .filter((n) => n.type === 'Case')
      .map((n) => n.entityId);
  } catch {
    return { iocs: [], tlp, huntName: hunt.name };
  }
  if (caseIds.length === 0) return { iocs: [], tlp, huntName: hunt.name };

  const session = getSession();
  let rows: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  try {
    const r = await session.run(
      `UNWIND $ids AS cid
       MATCH (c:Case {id: cid, tenantId: $tenantId})-[:HAS_ARTIFACT]->(a:Artifact)
       RETURN a.id AS id, a.type AS type, properties(a) AS data`,
      { tenantId, ids: caseIds },
    );
    rows = r.records.map((rec) => ({
      id: rec.get('id') as string,
      type: rec.get('type') as string,
      data: (rec.get('data') as Record<string, unknown>) ?? {},
    }));
  } finally {
    await session.close();
  }

  const iocs: HuntIoc[] = [];
  const seen = new Set<string>();
  for (const a of rows) {
    const d = a.data;
    switch (a.type) {
      case 'FILE':
        pushUnique(iocs, seen, 'md5', d.md5, a.id);
        pushUnique(iocs, seen, 'sha1', d.sha1, a.id);
        pushUnique(iocs, seen, 'sha256', d.sha256, a.id);
        break;
      case 'IOC': {
        const t = d.iocType as string | undefined;
        const v = d.value;
        if (t === 'IP') pushUnique(iocs, seen, 'ip', v, a.id);
        else if (t === 'DOMAIN') pushUnique(iocs, seen, 'domain', v, a.id);
        else if (t === 'URL') pushUnique(iocs, seen, 'url', v, a.id);
        else if (t === 'EMAIL') pushUnique(iocs, seen, 'email', v, a.id);
        else if (t === 'HASH') pushUnique(iocs, seen, 'sha256', v, a.id);
        break;
      }
      case 'NETWORK':
        pushUnique(iocs, seen, 'ip', d.dstIp, a.id);
        pushUnique(iocs, seen, 'ip', d.srcIp, a.id);
        break;
      case 'PROCESS':
        pushUnique(iocs, seen, 'process', d.name, a.id);
        break;
      case 'REGISTRY':
        if (typeof d.keyPath === 'string') {
          const hive = (d.hive as string) ?? 'HKLM';
          pushUnique(iocs, seen, 'registry', `${hive}\\${d.keyPath}`, a.id);
        }
        break;
    }
  }
  return { iocs, tlp, huntName: hunt.name };
}
