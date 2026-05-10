// Sigma rule generator. Two paths:
//
//   1. Lookup: for each MITRE technique in the seed, find existing
//      :DetectionRule with matching :DETECTS edge — return references
//      (these aren't NEW rules, just rule reuse). Phase H6 will pull
//      from SigmaHQ live; for H2 we lean on the seeded baseline.
//
//   2. Generate: for each PROCESS / REGISTRY / PERSISTENCE artifact, emit
//      a small Sigma YAML matching the observable. Less polished than
//      curated rules but covers behavioral IOCs the baseline misses.

import type { GeneratedRule, RuleSeed } from './types.js';

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50);
}

export function generateSigma(seed: RuleSeed, contextName: string): GeneratedRule[] {
  const rules: GeneratedRule[] = [];
  const safeCtx = safeId(contextName);
  const date = new Date().toISOString().slice(0, 10);

  // Process-based — match on Image/CommandLine fragment
  for (let i = 0; i < seed.processes.length; i++) {
    const p = seed.processes[i]!;
    const id = `helyx-${safeCtx}-proc-${i + 1}`;
    const techTags = seed.techniqueIds.map((t) => `attack.${t.toLowerCase()}`);
    const yaml = `title: Helyx ${contextName} - suspicious process ${p.name}
id: ${id}
description: Auto-generated Sigma rule for process ${p.name}
date: ${date}
status: experimental
author: Helyx
tags:
  - attack.execution
${techTags.map((t) => `  - ${t}`).join('\n')}
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\\${p.name}'
${p.commandLine ? `    CommandLine|contains: '${p.commandLine.replace(/'/g, "''").slice(0, 200)}'` : ''}
${p.parentName ? `    ParentImage|endswith: '\\${p.parentName}'` : ''}
  condition: selection
level: medium`;
    rules.push({
      kind: 'SIGMA',
      name: `Helyx ${contextName} - process ${p.name}`,
      description: `Sigma process rule from ${contextName}`,
      content: yaml,
      tags: ['sigma', 'process', ...techTags],
      derivedFromArtifactIds: [],
      detectsTechniqueIds: seed.techniqueIds,
    });
  }

  // Registry-based — match keyPath
  for (let i = 0; i < seed.registries.length; i++) {
    const r = seed.registries[i]!;
    const id = `helyx-${safeCtx}-reg-${i + 1}`;
    const techTags = seed.techniqueIds.map((t) => `attack.${t.toLowerCase()}`);
    const yaml = `title: Helyx ${contextName} - registry ${r.keyPath.slice(0, 30)}
id: ${id}
description: Auto-generated Sigma rule for registry key ${r.keyPath}
date: ${date}
status: experimental
author: Helyx
tags:
  - attack.persistence
${techTags.map((t) => `  - ${t}`).join('\n')}
logsource:
  category: registry_event
  product: windows
detection:
  selection:
    TargetObject|contains: '${r.hive}\\${r.keyPath.replace(/\\/g, '\\\\')}'
${r.valueName ? `    Details|contains: '${r.valueName}'` : ''}
  condition: selection
level: medium`;
    rules.push({
      kind: 'SIGMA',
      name: `Helyx ${contextName} - registry ${r.keyPath.slice(0, 50)}`,
      description: `Sigma registry rule from ${contextName}`,
      content: yaml,
      tags: ['sigma', 'registry', ...techTags],
      derivedFromArtifactIds: [],
      detectsTechniqueIds: seed.techniqueIds,
    });
  }

  return rules;
}
