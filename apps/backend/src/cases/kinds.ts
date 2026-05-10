// Single source of truth for case enums. types.ts re-exports; schema.ts
// interpolates. Add a status/verdict here, never inline elsewhere.

export const CASE_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'] as const;
export const CASE_VERDICTS = ['CONFIRMED', 'INCONCLUSIVE', 'CLEAN', 'PENDING'] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseVerdict = (typeof CASE_VERDICTS)[number];

// Verdicts assignable via closeCase. PENDING is the implicit default for
// open cases — only created by createCase, never reachable through close.
export const CLOSE_VERDICTS = ['CONFIRMED', 'INCONCLUSIVE', 'CLEAN'] as const;
export type CloseVerdict = (typeof CLOSE_VERDICTS)[number];
