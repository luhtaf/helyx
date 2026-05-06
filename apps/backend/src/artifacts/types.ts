export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ArtifactType =
  | 'IOC' | 'FILE' | 'PROCESS' | 'NETWORK' | 'REGISTRY' | 'PERSISTENCE'
  | 'ACCOUNT' | 'LOG_FINDING' | 'MEMORY' | 'DETECTION_HIT' | 'NOTE';

export interface ArtifactBaseRow {
  id: string;
  caseId: string;
  type: ArtifactType;
  observedAt: string;
  hostAssetId: string | null;
  severity: Severity;
  confidence: Confidence;
  notes: string | null;
  tags: string[];
  addedByUserId: string;
  addedAt: string;
}

// ---------------------------------------------------------------------------
// Per-type extension shapes (each merged with ArtifactBaseRow at runtime)
// ---------------------------------------------------------------------------

export interface IocFields {
  iocType: 'IP' | 'DOMAIN' | 'URL' | 'EMAIL' | 'HASH';
  value: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'BOTH' | null;
  firstSeen: string | null;
  lastSeen: string | null;
  source: string | null;
}

export interface FileFields {
  filename: string;
  filepath: string | null;
  md5: string | null;
  sha1: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  mime: string | null;
  signed: boolean | null;
  signer: string | null;
  behavior: string[];
}

export interface ProcessFields {
  name: string;
  pid: number | null;
  commandLine: string | null;
  parentName: string | null;
  user: string | null;
  startedAt: string | null;
  ttpHints: string[];
}

export interface NetworkFields {
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'HTTP' | 'DNS';
  srcIp: string;
  srcPort: number | null;
  dstIp: string;
  dstPort: number | null;
  direction: 'INBOUND' | 'OUTBOUND' | 'LATERAL' | null;
  bytes: number | null;
  connectionStartedAt: string | null;
}

export interface RegistryFields {
  hive: 'HKLM' | 'HKCU' | 'HKCR' | 'HKU' | 'HKCC';
  keyPath: string;
  valueName: string | null;
  valueData: string | null;
  action: 'CREATED' | 'MODIFIED' | 'DELETED';
}

export interface PersistenceFields {
  mechanism: 'SCHEDULED_TASK' | 'SERVICE' | 'STARTUP_FOLDER' | 'RUN_KEY' | 'WMI' | 'CRON' | 'SYSTEMD' | 'LAUNCHD' | 'OTHER';
  name: string;
  target: string | null;
  user: string | null;
  createdAtSrc: string | null;
}

export interface AccountFields {
  username: string;
  domain: string | null;
  action: 'CREATED' | 'PRIVILEGE_ESCALATED' | 'DISABLED' | 'PASSWORD_CHANGED' | 'LOGIN_ANOMALY';
  privileges: string[];
  sourceIp: string | null;
}

export interface LogFindingFields {
  logSource: string;
  eventId: string | null;
  timestamp: string;
  rawLine: string | null;
  observation: string;
}

export interface MemoryFields {
  processName: string;
  pid: number | null;
  finding: 'PROCESS_INJECTION' | 'HOLLOWING' | 'SHELLCODE' | 'UNBACKED_MEMORY' | 'STRINGS_MATCH' | 'OTHER';
  evidence: string | null;
  toolUsed: string | null;
}

export interface DetectionHitFields {
  ruleSource: 'SIGMA' | 'YARA' | 'WAZUH' | 'ELASTIC' | 'CUSTOM';
  ruleId: string;
  ruleName: string;
  firedAt: string;
  count: number | null;
}

export interface NoteFields {
  title: string | null;
  body: string;
  author: string;
}
