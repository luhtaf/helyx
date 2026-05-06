import { GraphQLError } from 'graphql';
import type { ArtifactType, ArtifactBaseRow } from '../types.js';
import type { CreateArtifactBase } from '../repo.js';

export const TYPE_TO_LABEL: Record<ArtifactType, string> = {
  IOC: 'Ioc',
  FILE: 'File',
  PROCESS: 'Process',
  NETWORK: 'Network',
  REGISTRY: 'Registry',
  PERSISTENCE: 'Persistence',
  ACCOUNT: 'Account',
  LOG_FINDING: 'LogFinding',
  MEMORY: 'Memory',
  DETECTION_HIT: 'DetectionHit',
  NOTE: 'Note',
};

export const LABEL_TO_GQL_TYPE: Record<string, string> = {
  Ioc: 'IocArtifact',
  File: 'FileArtifact',
  Process: 'ProcessArtifact',
  Network: 'NetworkArtifact',
  Registry: 'RegistryArtifact',
  Persistence: 'PersistenceArtifact',
  Account: 'AccountArtifact',
  LogFinding: 'LogFindingArtifact',
  Memory: 'MemoryArtifact',
  DetectionHit: 'DetectionHitArtifact',
  Note: 'NoteArtifact',
};

export function pickArtifactGqlType(labels: string[]): string {
  for (const l of labels) {
    if (LABEL_TO_GQL_TYPE[l]) return LABEL_TO_GQL_TYPE[l];
  }
  throw new GraphQLError(`Cannot resolve artifact type from labels: ${labels.join(',')}`);
}

export interface BaseInputShape {
  observedAt: string;
  hostAssetId?: string | null;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  notes?: string | null;
  tags?: string[] | null;
}

export function buildBase(
  base: BaseInputShape,
  type: ArtifactType,
  userId: string,
): CreateArtifactBase {
  return {
    type,
    observedAt: base.observedAt,
    hostAssetId: base.hostAssetId ?? null,
    severity: base.severity,
    confidence: base.confidence,
    notes: base.notes ?? null,
    tags: base.tags ?? [],
    addedByUserId: userId,
  };
}

export type ArtifactRowWithLabels = ArtifactBaseRow & Record<string, unknown> & { __labels: string[] };
