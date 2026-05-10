import { GraphQLError } from 'graphql';
import type { ArtifactType, ArtifactBaseRow } from '../types.js';
import type { CreateArtifactBase } from '../repo.js';
export { TYPE_TO_LABEL, LABEL_TO_GQL_TYPE } from '../kinds.js';
import { LABEL_TO_GQL_TYPE } from '../kinds.js';

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
