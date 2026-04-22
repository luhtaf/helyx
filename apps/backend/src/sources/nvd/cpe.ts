export interface ParsedCpe {
  uri: string;
  part: string;
  vendor: string;
  product: string;
  version: string;
  update: string;
  edition: string;
  language: string;
  swEdition: string;
  targetSw: string;
  targetHw: string;
  other: string;
}

const PREFIX = 'cpe:2.3:';

export function parseCpe(uri: string): ParsedCpe | null {
  if (!uri.startsWith(PREFIX)) return null;
  const parts = splitCpe(uri.slice(PREFIX.length));
  if (parts.length !== 11) return null;
  const [
    part, vendor, product, version, update, edition,
    language, swEdition, targetSw, targetHw, other,
  ] = parts as [string, string, string, string, string, string, string, string, string, string, string];
  return { uri, part, vendor, product, version, update, edition, language, swEdition, targetSw, targetHw, other };
}

function splitCpe(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      cur += s[i + 1];
      i++;
      continue;
    }
    if (ch === ':') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
