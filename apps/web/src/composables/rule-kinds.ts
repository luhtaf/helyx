// Single source of truth for rule enums on the FE side. Mirror of
// backend kinds.ts because Helyx has no codegen yet — when adding a kind /
// status / source, edit BOTH this file AND apps/backend/src/rules/kinds.ts.

export const RULE_KINDS = ['YARA', 'SURICATA', 'SIGMA', 'CUSTOM'] as const;
export const RULE_STATUSES = ['ACTIVE', 'DRAFT', 'DEPRECATED'] as const;
// Underscored — matches the GraphQL wire form, not the BE storage form.
export const RULE_SOURCES = [
  'manual',
  'sigma_community',
  'otx',
  'helyx_generated',
  'imported_stix',
  'imported_openioc',
] as const;

export type RuleKind = (typeof RULE_KINDS)[number];
export type RuleStatus = (typeof RULE_STATUSES)[number];
export type RuleSource = (typeof RULE_SOURCES)[number];

// Color mapping per kind/status. Record<…> forces exhaustive coverage —
// adding a new kind without giving it a class is a compile error, not a
// runtime fall-through. Lives here so RulesView and RuleDetailView share it.
export const KIND_CLASSES: Record<RuleKind, string> = {
  YARA:     'text-sev-high',
  SURICATA: 'text-sev-med',
  SIGMA:    'text-sev-low',
  CUSTOM:   'text-ink-dim',
};

export const STATUS_CLASSES: Record<RuleStatus, string> = {
  ACTIVE:     'text-sev-low',
  DRAFT:      'text-ink-dim',
  DEPRECATED: 'text-ink-faint',
};

export function sourceLabel(s: RuleSource): string {
  return s.replace(/_/g, ' ');
}
