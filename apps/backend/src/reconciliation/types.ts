export { type ReconciliationStatus, type MatchReason } from './kinds.js';
import type { ReconciliationStatus, MatchReason } from './kinds.js';

export interface RawStakeholderRow {
  id: string;
  source: string;
  rawName: string;
  normalizedKey: string;
  rawSektor: string | null;
  hitCount: number;
  targetCount: number;
  lastSeen: string;
  status: ReconciliationStatus;
  confidence: number | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolvedToId: string | null;
}

export interface SuggestionRow {
  stakeholderId: string;
  confidence: number;
  reason: MatchReason;
}
