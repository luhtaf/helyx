// FE single source of truth for case enums + their visual mappings.
// Mirror of apps/backend/src/cases/kinds.ts (Helyx has no codegen yet).
// All consumers (composables, badges, views) MUST import from here.

export const CASE_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'] as const;
export const CASE_VERDICTS = ['CONFIRMED', 'INCONCLUSIVE', 'CLEAN', 'PENDING'] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseVerdict = (typeof CASE_VERDICTS)[number];

// Verdicts assignable via closeCase. PENDING is the open-state default
// and only enters via createCase, never via the close-modal.
export const CLOSE_VERDICTS = ['CONFIRMED', 'INCONCLUSIVE', 'CLEAN'] as const;
export type CloseVerdict = (typeof CLOSE_VERDICTS)[number];

// ACTIVE uses signal (operational state, not severity). sev-* reserved for
// verdict semantics — see autoplan #20 when picking colors for new statuses.
export const CASE_STATUS_COLORS: Record<CaseStatus, string> = {
  DRAFT:    'bg-ink-faint/15 text-ink-dim border-ink-faint/30',
  ACTIVE:   'bg-signal/15 text-signal border-signal/30',
  CLOSED:   'bg-sev-low/15 text-sev-low border-sev-low/30',
  ARCHIVED: 'bg-ink-faint/10 text-ink-faint border-ink-faint/20',
};

export const CASE_VERDICT_COLORS: Record<CaseVerdict, string> = {
  CONFIRMED:    'bg-sev-crit/15 text-sev-crit border-sev-crit/30',
  INCONCLUSIVE: 'bg-sev-med/15 text-sev-med border-sev-med/30',
  CLEAN:        'bg-sev-low/15 text-sev-low border-sev-low/30',
  PENDING:      'bg-ink-faint/15 text-ink-dim border-ink-faint/30',
};

export const CASE_VERDICT_LABELS: Record<CaseVerdict, string> = {
  CONFIRMED:    'compromised',
  INCONCLUSIVE: 'inconclusive',
  CLEAN:        'clean',
  PENDING:      'pending',
};
