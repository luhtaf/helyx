// Suricata rule generator. One rule per IP / Domain / URL IOC.
// SID range: Helyx reserves 9000000-9999999 for auto-gen rules.

import type { GeneratedRule, RuleSeed } from './types.js';

let sidCounter = 9_000_001;
function nextSid(): number {
  return sidCounter++;
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 \-_.]/g, '').slice(0, 80);
}

export function generateSuricata(
  seed: RuleSeed,
  contextName: string,
  artifactIdsByValue?: Map<string, string>,
): GeneratedRule[] {
  const rules: GeneratedRule[] = [];
  const safeCtx = safeName(contextName);

  // IP-based — outbound C2 callback
  for (const ip of seed.ips) {
    const sid = nextSid();
    const rule = `alert ip $HOME_NET any -> ${ip.value} any (msg:"Helyx ${safeCtx} - C2 callback to ${ip.value}"; sid:${sid}; rev:1; metadata:helyx_context ${safeCtx}, attack ${seed.techniqueIds[0] ?? 'T1071'};)`;
    rules.push({
      kind: 'SURICATA',
      name: `helyx_ip_${ip.value.replace(/\./g, '_')}_${sid}`,
      description: `Suricata IP block for ${ip.value} from ${contextName}`,
      content: rule,
      tags: ['suricata', 'ip', `attack.${(seed.techniqueIds[0] ?? 'T1071').toLowerCase()}`],
      derivedFromArtifactIds: artifactIdsByValue ? [artifactIdsByValue.get(ip.value) ?? ''].filter(Boolean) : [],
      detectsTechniqueIds: seed.techniqueIds,
    });
  }

  // Domain-based — DNS query alert
  for (const d of seed.domains) {
    const sid = nextSid();
    const rule = `alert dns $HOME_NET any -> any any (msg:"Helyx ${safeCtx} - DNS query for ${d.value}"; dns.query; content:"${d.value}"; nocase; sid:${sid}; rev:1; metadata:helyx_context ${safeCtx}, attack ${seed.techniqueIds[0] ?? 'T1071.004'};)`;
    rules.push({
      kind: 'SURICATA',
      name: `helyx_dns_${d.value.replace(/\./g, '_')}_${sid}`,
      description: `Suricata DNS alert for ${d.value} from ${contextName}`,
      content: rule,
      tags: ['suricata', 'dns', `attack.${(seed.techniqueIds[0] ?? 'T1071.004').toLowerCase()}`],
      derivedFromArtifactIds: artifactIdsByValue ? [artifactIdsByValue.get(d.value) ?? ''].filter(Boolean) : [],
      detectsTechniqueIds: seed.techniqueIds,
    });
  }

  // URL-based — HTTP request match
  for (const u of seed.urls) {
    const sid = nextSid();
    // Strip protocol+host, keep path for content match (simple heuristic).
    let path = u.value;
    try {
      const parsed = new URL(u.value);
      path = parsed.pathname + parsed.search;
    } catch { /* keep raw */ }
    const rule = `alert http $HOME_NET any -> any any (msg:"Helyx ${safeCtx} - HTTP request matching ${u.value}"; http.uri; content:"${path}"; nocase; sid:${sid}; rev:1; metadata:helyx_context ${safeCtx}, attack ${seed.techniqueIds[0] ?? 'T1071.001'};)`;
    rules.push({
      kind: 'SURICATA',
      name: `helyx_url_${sid}`,
      description: `Suricata HTTP URI alert from ${contextName}`,
      content: rule,
      tags: ['suricata', 'http', `attack.${(seed.techniqueIds[0] ?? 'T1071.001').toLowerCase()}`],
      derivedFromArtifactIds: artifactIdsByValue ? [artifactIdsByValue.get(u.value) ?? ''].filter(Boolean) : [],
      detectsTechniqueIds: seed.techniqueIds,
    });
  }

  return rules;
}
