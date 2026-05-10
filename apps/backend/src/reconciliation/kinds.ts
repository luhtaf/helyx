// Single source of truth for reconciliation enums.
// types.ts re-exports; schema.ts interpolates; fuzzy.ts emits these literals.

export const RECONCILIATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

// Why a fuzzy matcher chose a stakeholder. Promoted from a loose `String`
// schema field to a proper enum so FE and matcher logic can't drift on
// values. Renamed from hyphenated kebab-case ('alias-match') to UPPER_SNAKE
// to satisfy GraphQL enum naming rules.
//
// Not all values are emitted yet: fuzzy.ts currently emits ALIAS_MATCH,
// LEVENSHTEIN, ACRONYM_MATCH. DOMAIN_MATCH and PATTERN_MATCH are reserved
// for upcoming matcher rules.
export const MATCH_REASONS = [
  'ALIAS_MATCH', 'LEVENSHTEIN', 'DOMAIN_MATCH', 'ACRONYM_MATCH', 'PATTERN_MATCH',
] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];
