// FE single source of truth for artifact-related enums.
// Mirror of backend artifacts/kinds.ts. When adding a value, edit BOTH.

export const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const IOC_TYPES = ['IP', 'DOMAIN', 'URL', 'EMAIL', 'HASH'] as const;
export type IocType = (typeof IOC_TYPES)[number];

// Direction enum is the union of (IOC + Network) for schema alignment.
// IOC artifacts realistically use INBOUND / OUTBOUND / BOTH; LATERAL
// is more network-bound but still valid per schema.
export const DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BOTH', 'LATERAL'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const IOC_TYPE_LABELS: Record<IocType, string> = {
  IP:     'IP address',
  DOMAIN: 'Domain',
  URL:    'URL',
  EMAIL:  'Email',
  HASH:   'File hash',
};

export const SEVERITY_TONE: Record<Severity, string> = {
  INFO:     'text-ink-faint',
  LOW:      'text-sev-low',
  MEDIUM:   'text-sev-med',
  HIGH:     'text-sev-high',
  CRITICAL: 'text-sev-crit',
};
