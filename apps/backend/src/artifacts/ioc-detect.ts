export type DetectedIocType = 'IP' | 'DOMAIN' | 'URL' | 'EMAIL' | 'HASH';

const PATTERNS: Array<{ type: DetectedIocType; rx: RegExp }> = [
  { type: 'URL',    rx: /^https?:\/\/[^\s]+$/i },
  { type: 'EMAIL',  rx: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { type: 'IP',     rx: /^(\d{1,3}\.){3}\d{1,3}$/ },
  { type: 'HASH',   rx: /^[a-f0-9]{32,128}$/i },
  { type: 'DOMAIN', rx: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i },
];

export function detectIocType(value: string): DetectedIocType | null {
  const v = value.trim();
  if (!v) return null;
  for (const p of PATTERNS) if (p.rx.test(v)) return p.type;
  return null;
}

export function bulkParseIocs(blob: string): Array<{ value: string; iocType: DetectedIocType }> {
  return blob
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => ({ value, iocType: detectIocType(value) }))
    .filter((x): x is { value: string; iocType: DetectedIocType } => x.iocType !== null);
}
