// H2.2 — Pack hunt-generated rules as a downloadable zip.
// Layout: yara/, suricata/, sigma/ subdirs + manifest.json at root.
// Rules are read from the existing :DetectionRule store (must be
// generated via generateRulesFromHunt first; this is a packaging layer
// over already-persisted rules, not a re-generator).

import JSZip from 'jszip';
import { getSession } from '../db/neo4j.js';
import type { RuleKind } from '../rules/kinds.js';

interface BundleRule {
  id: string;
  kind: RuleKind;
  name: string;
  content: string;
  tags: string[];
  status: string;
  createdAt: string;
}

interface BundleManifest {
  hunt: { id: string; name: string };
  generatedAt: string;
  ruleCounts: { yara: number; suricata: number; sigma: number; custom: number; total: number };
  rules: Array<{ id: string; kind: RuleKind; filename: string; tags: string[]; status: string }>;
}

const EXT_BY_KIND: Record<RuleKind, string> = {
  YARA:     '.yar',
  SURICATA: '.rules',
  SIGMA:    '.yml',
  CUSTOM:   '.txt',
};

const SUBDIR_BY_KIND: Record<RuleKind, string> = {
  YARA:     'yara',
  SURICATA: 'suricata',
  SIGMA:    'sigma',
  CUSTOM:   'custom',
};

// Sanitize rule name for filesystem: alphanumeric + dash + underscore only,
// truncated to 80 chars to stay safe under fs limits across platforms.
function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'unnamed';
}

async function fetchHuntRules(tenantId: string, huntId: string): Promise<{
  hunt: { id: string; name: string } | null;
  rules: BundleRule[];
}> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
       OPTIONAL MATCH (h)-[:GENERATED]->(r:DetectionRule)
       WITH h, r ORDER BY r.kind ASC, r.name ASC
       RETURN h.id AS huntId, h.name AS huntName,
              collect(CASE WHEN r IS NULL THEN null ELSE {
                id: r.id, kind: r.kind, name: r.name, content: r.content,
                tags: r.tags, status: r.status, createdAt: toString(r.createdAt)
              } END) AS rules`,
      { tenantId, huntId },
    );
    const rec = r.records[0];
    if (!rec) return { hunt: null, rules: [] };
    const hunt = { id: rec.get('huntId') as string, name: rec.get('huntName') as string };
    const rawRules = rec.get('rules') as Array<BundleRule | null>;
    return { hunt, rules: rawRules.filter((x): x is BundleRule => x !== null) };
  } finally {
    await session.close();
  }
}

// Returns the zip bytes as a Buffer; caller decides whether to ship via
// REST Content-Disposition or base64 over GraphQL. Keep this layer pure.
export async function packHuntRulesAsZip(
  tenantId: string,
  huntId: string,
): Promise<{ ok: true; filename: string; bytes: Buffer; manifest: BundleManifest } | { ok: false; reason: string }> {
  const { hunt, rules } = await fetchHuntRules(tenantId, huntId);
  if (!hunt) return { ok: false, reason: 'hunt not found' };
  if (rules.length === 0) return { ok: false, reason: 'hunt has no generated rules — run generateRulesFromHunt first' };

  const zip = new JSZip();
  const counts: BundleManifest['ruleCounts'] = { yara: 0, suricata: 0, sigma: 0, custom: 0, total: 0 };
  const manifestRules: BundleManifest['rules'] = [];
  // Track filenames per subdir to disambiguate collisions (two rules with
  // same name → suffix _2, _3, ...).
  const usedNames: Record<string, Set<string>> = { yara: new Set(), suricata: new Set(), sigma: new Set(), custom: new Set() };

  for (const r of rules) {
    const subdir = SUBDIR_BY_KIND[r.kind];
    const ext = EXT_BY_KIND[r.kind];
    let base = safeFilename(r.name);
    let candidate = base + ext;
    let n = 2;
    while (usedNames[subdir]!.has(candidate)) {
      candidate = `${base}_${n}${ext}`;
      n++;
    }
    usedNames[subdir]!.add(candidate);

    zip.file(`${subdir}/${candidate}`, r.content);

    counts[subdir as keyof typeof counts]++;
    counts.total++;
    manifestRules.push({ id: r.id, kind: r.kind, filename: `${subdir}/${candidate}`, tags: r.tags, status: r.status });
  }

  const manifest: BundleManifest = {
    hunt,
    generatedAt: new Date().toISOString(),
    ruleCounts: counts,
    rules: manifestRules,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const filename = `${safeFilename(hunt.name)}-rules.zip`;
  return { ok: true, filename, bytes, manifest };
}
