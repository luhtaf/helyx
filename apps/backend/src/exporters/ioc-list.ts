import type { HuntIoc, IocKind } from './iocs.js';

// Plain flat IOC list — newline values grouped by type with `# ==`
// section headers + a TLP/provenance banner. Feeds blocklists / the
// reputation pipeline / quick grep. Comment lines start with '#' so
// most ingest tools (and humans) can skip the banner trivially.

const ORDER: IocKind[] = [
  'md5', 'sha1', 'sha256', 'ip', 'domain', 'url', 'email', 'process', 'registry',
];

export function buildIocList(
  huntName: string,
  iocs: HuntIoc[],
  tlp: string,
): string {
  const now = new Date().toISOString();
  const lines: string[] = [
    `# Helyx IOC export — ${huntName}`,
    `# ${tlp} · ${iocs.length} indicators · ${now}`,
    `# Handle per marking. Comment lines (#) are not indicators.`,
    ``,
  ];
  for (const kind of ORDER) {
    const group = iocs.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    lines.push(`# == ${kind} (${group.length}) ==`);
    for (const i of group) lines.push(i.value);
    lines.push(``);
  }
  return lines.join('\n');
}
