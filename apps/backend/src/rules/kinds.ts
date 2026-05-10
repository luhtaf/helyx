// Single source of truth for the three rule enums + the wire-encoding rules.
// Everything else (TS types, GraphQL schema interpolation, Zod input validation,
// resolver encode/decode) MUST derive from these constants — not redeclare them.

export const RULE_KINDS = ['YARA', 'SURICATA', 'SIGMA', 'CUSTOM'] as const;
export const RULE_STATUSES = ['DRAFT', 'ACTIVE', 'DEPRECATED'] as const;

// Storage/wire are intentionally different: Neo4j stores hyphenated
// ('sigma-community'); GraphQL exposes underscored ('sigma_community')
// because GraphQL enum names can't contain '-'.
export const RULE_SOURCES = [
  'manual',
  'sigma-community',
  'otx',
  'helyx-generated',
  'imported-stix',
  'imported-openioc',
] as const;

export type RuleKind = (typeof RULE_KINDS)[number];
export type RuleStatus = (typeof RULE_STATUSES)[number];
export type RuleSource = (typeof RULE_SOURCES)[number];

export function encodeSource(s: RuleSource): string {
  return s.replace(/-/g, '_');
}

export function decodeSource(s: string | null | undefined): RuleSource | null {
  if (!s) return null;
  const found = RULE_SOURCES.find((rs) => encodeSource(rs) === s || rs === s);
  return found ?? null;
}
