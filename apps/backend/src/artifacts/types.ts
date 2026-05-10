// Re-export ALL enum types from kinds.ts (the single source of truth).
// This file owns only the per-type field-shape interfaces, which compose
// the imported enum types.

export {
  type ArtifactType,
  type Severity,
  type Confidence,
  type IocType,
  type IocDirection,
  type NetworkDirection,
  type NetProtocol,
  type RegistryHive,
  type RegistryAction,
  type PersistenceMechanism,
  type AccountAction,
  type MemoryFinding,
  type DetectionEngine,
} from './kinds.js';

import type {
  ArtifactType,
  Severity,
  Confidence,
  IocType,
  IocDirection,
  NetworkDirection,
  NetProtocol,
  RegistryHive,
  RegistryAction,
  PersistenceMechanism,
  AccountAction,
  MemoryFinding,
  DetectionEngine,
} from './kinds.js';

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
  iocType: IocType;
  value: string;
  direction: IocDirection | null;
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
  protocol: NetProtocol;
  srcIp: string;
  srcPort: number | null;
  dstIp: string;
  dstPort: number | null;
  direction: NetworkDirection | null;
  bytes: number | null;
  connectionStartedAt: string | null;
}

export interface RegistryFields {
  hive: RegistryHive;
  keyPath: string;
  valueName: string | null;
  valueData: string | null;
  action: RegistryAction;
}

export interface PersistenceFields {
  mechanism: PersistenceMechanism;
  name: string;
  target: string | null;
  user: string | null;
  createdAtSrc: string | null;
}

export interface AccountFields {
  username: string;
  domain: string | null;
  action: AccountAction;
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
  finding: MemoryFinding;
  evidence: string | null;
  toolUsed: string | null;
}

export interface DetectionHitFields {
  ruleSource: DetectionEngine;
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
