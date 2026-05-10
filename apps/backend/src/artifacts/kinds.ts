// Single source of truth for ALL artifact-side enums + label dispatch.
// types.ts re-exports the TS unions; schema.ts interpolates the GraphQL
// enums; repo.ts and resolvers/_shared.ts import the dispatch maps.
// Adding a new artifact type or sub-enum value = edit THIS FILE ONLY.

// ---------------------------------------------------------------------------
// Top-level: artifact polymorphism
// ---------------------------------------------------------------------------

// Order matches the GraphQL enum + the case detail tabs ordering.
export const ARTIFACT_TYPES = [
  'IOC', 'FILE', 'PROCESS', 'NETWORK', 'REGISTRY', 'PERSISTENCE',
  'ACCOUNT', 'LOG_FINDING', 'MEMORY', 'DETECTION_HIT', 'NOTE',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

// ENUM_VALUE → Neo4j multi-label name applied alongside :Artifact.
// e.g. (:Artifact:Ioc), (:Artifact:LogFinding). Used by repo to add the
// label and by resolvers/_shared to resolve a row's GraphQL type.
export const TYPE_TO_LABEL: Record<ArtifactType, string> = {
  IOC:           'Ioc',
  FILE:          'File',
  PROCESS:       'Process',
  NETWORK:       'Network',
  REGISTRY:      'Registry',
  PERSISTENCE:   'Persistence',
  ACCOUNT:       'Account',
  LOG_FINDING:   'LogFinding',
  MEMORY:        'Memory',
  DETECTION_HIT: 'DetectionHit',
  NOTE:          'Note',
};

// Derived: Neo4j label → GraphQL union member name. Used by __resolveType.
// Always `${label}Artifact` so derive instead of hand-maintaining.
export const LABEL_TO_GQL_TYPE: Record<string, string> = Object.fromEntries(
  Object.values(TYPE_TO_LABEL).map((label) => [label, `${label}Artifact`]),
);

// ---------------------------------------------------------------------------
// Cross-cutting: severity + confidence
// ---------------------------------------------------------------------------

// Order = ranked low→high. SEVERITY_RANK derives from the index so adding
// a new severity in the right slot is the only change needed.
export const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type Confidence = (typeof CONFIDENCES)[number];

export const SEVERITY_RANK: Record<Severity, number> = Object.fromEntries(
  SEVERITIES.map((s, i) => [s, i]),
) as Record<Severity, number>;

// ---------------------------------------------------------------------------
// Per-artifact-type sub-enums
// ---------------------------------------------------------------------------

export const IOC_TYPES = ['IP', 'DOMAIN', 'URL', 'EMAIL', 'HASH'] as const;
export type IocType = (typeof IOC_TYPES)[number];

// IOC.direction and Network.direction share a GraphQL enum (Direction)
// but use different value subsets. Keep two narrow TS constants — the
// GraphQL union is the superset (DIRECTIONS) for schema interpolation.
export const IOC_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BOTH'] as const;
export const NETWORK_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'LATERAL'] as const;
export const DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BOTH', 'LATERAL'] as const;
export type IocDirection = (typeof IOC_DIRECTIONS)[number];
export type NetworkDirection = (typeof NETWORK_DIRECTIONS)[number];

export const NET_PROTOCOLS = ['TCP', 'UDP', 'ICMP', 'HTTP', 'DNS'] as const;
export type NetProtocol = (typeof NET_PROTOCOLS)[number];

export const REGISTRY_HIVES = ['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC'] as const;
export const REGISTRY_ACTIONS = ['CREATED', 'MODIFIED', 'DELETED'] as const;
export type RegistryHive = (typeof REGISTRY_HIVES)[number];
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

// Renamed from `RuleSource` to disambiguate from the DetectionRule feature's
// RuleSource enum (which has different values: manual / sigma_community / etc.).
// Apollo/graphql-tools silently merged the two into one mixed enum — schema
// bug. Renaming to DetectionEngine here also reads better: it describes
// which detection engine fired the rule. GraphQL field renamed in lock-step.
export const DETECTION_ENGINES = ['SIGMA', 'YARA', 'WAZUH', 'ELASTIC', 'CUSTOM'] as const;
export type DetectionEngine = (typeof DETECTION_ENGINES)[number];
