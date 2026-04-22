export interface Purl {
  type: string;
  namespace: string | null;
  name: string;
  version: string | null;
  qualifiers: Record<string, string>;
  subpath: string | null;
}

const PREFIX_RE = /^pkg:([a-zA-Z][a-zA-Z0-9.+-]*)\/(.+)$/;

export function parsePurl(s: string): Purl | null {
  const m = PREFIX_RE.exec(s);
  if (!m) return null;
  const type = m[1]!.toLowerCase();
  let rest = m[2]!;

  let subpath: string | null = null;
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    subpath = decodeURIComponent(rest.slice(hashIdx + 1));
    rest = rest.slice(0, hashIdx);
  }

  const qualifiers: Record<string, string> = {};
  const qIdx = rest.indexOf('?');
  if (qIdx >= 0) {
    for (const pair of rest.slice(qIdx + 1).split('&')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      qualifiers[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
    rest = rest.slice(0, qIdx);
  }

  let version: string | null = null;
  const atIdx = rest.lastIndexOf('@');
  if (atIdx >= 0) {
    version = decodeURIComponent(rest.slice(atIdx + 1));
    rest = rest.slice(0, atIdx);
  }

  let namespace: string | null = null;
  let name: string;
  const slashIdx = rest.lastIndexOf('/');
  if (slashIdx >= 0) {
    namespace = decodeURIComponent(rest.slice(0, slashIdx));
    name = decodeURIComponent(rest.slice(slashIdx + 1));
  } else {
    name = decodeURIComponent(rest);
  }

  return { type, namespace, name, version, qualifiers, subpath };
}

export function productSlugCandidates(purl: Purl): string[] {
  const base = purl.name.toLowerCase();
  const variants = new Set<string>();
  variants.add(base);
  variants.add(base.replace(/-/g, '_'));
  variants.add(base.replace(/\./g, '_'));
  variants.add(base.replace(/[-.]/g, '_'));
  return [...variants].filter(Boolean);
}
