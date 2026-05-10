// YARA rule generator. Templates one rule per file hash IOC.
// Best for endpoint scans / memory dumps.
//
// We emit hash-based rules (md5/sha256). Pattern-based (strings) and
// behavioral rules can be added later when we capture rich file context.

import type { GeneratedRule, RuleSeed } from './types.js';

function safeName(s: string): string {
  return s
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'unnamed';
}

export function generateYara(seed: RuleSeed, contextName: string, artifactIdsByFile?: Map<string, string>): GeneratedRule[] {
  const rules: GeneratedRule[] = [];
  const stem = safeName(contextName);

  for (let i = 0; i < seed.fileHashes.length; i++) {
    const f = seed.fileHashes[i]!;
    const filename = f.filename ?? 'unknown';
    const ruleName = `${stem}_filehash_${i + 1}`;

    // Hash-based YARA — uses `hash` module; always evaluates against full file.
    // Prefer sha256, fall back to md5; emit BOTH in condition so either matches.
    const hashLines: string[] = [];
    if (f.sha256) hashLines.push(`hash.sha256(0, filesize) == "${f.sha256.toLowerCase()}"`);
    if (f.md5)    hashLines.push(`hash.md5(0, filesize) == "${f.md5.toLowerCase()}"`);
    if (hashLines.length === 0) continue;  // skip if no usable hash

    const yara = `import "hash"

rule ${ruleName} {
    meta:
        description = "Helyx auto-gen: detect ${filename}"
        author = "Helyx"
        date = "${new Date().toISOString().slice(0, 10)}"
        helyx_context = "${contextName}"
        ${seed.techniqueIds.length ? `mitre_attack = "${seed.techniqueIds[0]}"` : ''}
    condition:
        ${hashLines.join(' or ')}
}`;

    rules.push({
      kind: 'YARA',
      name: ruleName,
      description: `YARA hash rule for file ${filename} from ${contextName}`,
      content: yara,
      tags: ['yara', 'filehash', ...(seed.techniqueIds.length ? [`attack.${seed.techniqueIds[0]!.toLowerCase()}`] : [])],
      derivedFromArtifactIds: artifactIdsByFile && f.sha256
        ? [artifactIdsByFile.get(f.sha256) ?? ''].filter(Boolean) : [],
      detectsTechniqueIds: seed.techniqueIds,
    });
  }
  return rules;
}
