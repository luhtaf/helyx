// Single source of truth for FE severity enum + the 4 ways the codebase
// asks "what color/class for this severity?": runtime hex, CSS var(),
// Tailwind class, or stable rank for sorting. Add a new severity here
// and the Records below force compile-time updates everywhere.

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Severity = (typeof SEVERITIES)[number];

// Severity rank for sorting. Higher = more severe. Derived from order.
export const SEVERITY_RANK: Record<Severity, number> = Object.fromEntries(
  SEVERITIES.map((s, i) => [s, SEVERITIES.length - i]),
) as Record<Severity, number>;

// CSS-var token name per severity. SoT for the next 3 helpers.
const SEVERITY_TOKEN: Record<Severity, string> = {
  CRITICAL: '--sev-crit',
  HIGH:     '--sev-high',
  MEDIUM:   '--sev-med',
  LOW:      '--sev-low',
};
const NONE_TOKEN = '--sev-none';

// Tailwind class per severity. Mirror of the token names above; if a
// severity is added, both Records must update — TS Record<Severity,…>
// forces it.
export const SEVERITY_CLASS: Record<Severity, string> = {
  CRITICAL: 'text-sev-crit',
  HIGH:     'text-sev-high',
  MEDIUM:   'text-sev-med',
  LOW:      'text-sev-low',
};
const NONE_CLASS = 'text-ink';

function readVar(name: string): string {
  if (typeof window === 'undefined') return '#888888';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}

function lookup(severity: string | null | undefined): Severity | null {
  const upper = (severity ?? '').toUpperCase();
  return (SEVERITIES as readonly string[]).includes(upper) ? (upper as Severity) : null;
}

// Resolve runtime hex (cytoscape canvas needs literal hex, not var()).
export function severityHex(severity: string | null | undefined): string {
  const s = lookup(severity);
  return readVar(s ? SEVERITY_TOKEN[s] : NONE_TOKEN);
}

// CSS var() string for inline `border-color: var(--sev-crit)`.
export function severityBorderVar(severity: string | null | undefined): string {
  const s = lookup(severity);
  return `var(${s ? SEVERITY_TOKEN[s] : NONE_TOKEN})`;
}

// Tailwind text-sev-* class for badges / labels.
export function severityClass(severity: string | null | undefined): string {
  const s = lookup(severity);
  return s ? SEVERITY_CLASS[s] : NONE_CLASS;
}

export function inkDimHex(): string {
  return readVar('--ink-dim');
}

export function inkFaintHex(): string {
  return readVar('--ink-faint');
}

export function signalHex(): string {
  return readVar('--signal');
}
