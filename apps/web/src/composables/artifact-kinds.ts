// FE single source of truth for artifact-related enums.
// Mirror of backend artifacts/kinds.ts. When adding a value, edit BOTH.

export const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

// Top-level artifact polymorphism. Order matches backend ARTIFACT_TYPES
// + the case detail tab ordering.
export const ARTIFACT_TYPES = [
  'IOC', 'FILE', 'PROCESS', 'NETWORK', 'REGISTRY', 'PERSISTENCE',
  'ACCOUNT', 'LOG_FINDING', 'MEMORY', 'DETECTION_HIT', 'NOTE',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  IOC:           'IOC',
  FILE:          'File',
  PROCESS:       'Process',
  NETWORK:       'Network',
  REGISTRY:      'Registry',
  PERSISTENCE:   'Persistence',
  ACCOUNT:       'Account',
  LOG_FINDING:   'Log finding',
  MEMORY:        'Memory',
  DETECTION_HIT: 'Detection hit',
  NOTE:          'Note',
};

export const IOC_TYPES = ['IP', 'DOMAIN', 'URL', 'EMAIL', 'HASH'] as const;
export type IocType = (typeof IOC_TYPES)[number];

// Per-type sub-enums (mirror backend artifacts/kinds.ts exactly).
export const NET_PROTOCOLS = ['TCP', 'UDP', 'ICMP', 'HTTP', 'DNS'] as const;
export type NetProtocol = (typeof NET_PROTOCOLS)[number];

export const REGISTRY_HIVES = ['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC'] as const;
export type RegistryHive = (typeof REGISTRY_HIVES)[number];

export const REGISTRY_ACTIONS = ['CREATED', 'MODIFIED', 'DELETED'] as const;
export type RegistryAction = (typeof REGISTRY_ACTIONS)[number];

export const PERSISTENCE_MECHANISMS = [
  'SCHEDULED_TASK', 'SERVICE', 'STARTUP_FOLDER', 'RUN_KEY',
  'WMI', 'CRON', 'SYSTEMD', 'LAUNCHD', 'OTHER',
] as const;
export type PersistenceMechanism = (typeof PERSISTENCE_MECHANISMS)[number];

export const ACCOUNT_ACTIONS = [
  'CREATED', 'PRIVILEGE_ESCALATED', 'DISABLED', 'PASSWORD_CHANGED', 'LOGIN_ANOMALY',
] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

export const MEMORY_FINDINGS = [
  'PROCESS_INJECTION', 'HOLLOWING', 'SHELLCODE',
  'UNBACKED_MEMORY', 'STRINGS_MATCH', 'OTHER',
] as const;
export type MemoryFinding = (typeof MEMORY_FINDINGS)[number];

export const DETECTION_ENGINES = ['SIGMA', 'YARA', 'WAZUH', 'ELASTIC', 'CUSTOM'] as const;
export type DetectionEngine = (typeof DETECTION_ENGINES)[number];

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
