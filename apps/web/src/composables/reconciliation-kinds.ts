// FE single source of truth for reconciliation enums + match-reason labels.
// Mirror of backend reconciliation/kinds.ts (no codegen yet).

export const RECONCILIATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const MATCH_REASONS = [
  'ALIAS_MATCH', 'LEVENSHTEIN', 'DOMAIN_MATCH', 'ACRONYM_MATCH', 'PATTERN_MATCH',
] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

// Compact display labels for the suggestion-row reason chip. Use the
// matcher's literal value (ALIAS_MATCH) as the key, render the friendly
// short form. Adding a new reason here = compile error until labelled.
export const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  ALIAS_MATCH:   'alias',
  LEVENSHTEIN:   'fuzzy',
  DOMAIN_MATCH:  'domain',
  ACRONYM_MATCH: 'acronym',
  PATTERN_MATCH: 'pattern',
};
