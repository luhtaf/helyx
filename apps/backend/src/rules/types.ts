// Re-export from kinds.ts (the single source of truth). Adding a new kind /
// status / source = edit kinds.ts ONLY; everything below derives.
export { type RuleKind, type RuleStatus, type RuleSource } from './kinds.js';
import type { RuleKind, RuleStatus, RuleSource } from './kinds.js';

export interface DetectionRuleRow {
  id: string;
  tenantId: string;
  kind: RuleKind;
  name: string;
  description: string | null;
  content: string;
  tags: string[];
  source: RuleSource;
  sourceRef: string | null;
  status: RuleStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  derivedFromArtifactCount: number;
  detectsTechniqueCount: number;
  generatedByHuntCount: number;
}

export interface RuleFilter {
  kind?: RuleKind | null;
  status?: RuleStatus | null;
  source?: RuleSource | null;
  tag?: string | null;
  search?: string | null;
}

export interface CreateRuleInput {
  kind: RuleKind;
  name: string;
  description?: string | null;
  content: string;
  tags?: string[];
  source?: RuleSource;
  sourceRef?: string | null;
  status?: RuleStatus;
  derivedFromArtifactIds?: string[];
  detectsTechniqueIds?: string[];
}

export interface UpdateRuleInput {
  name?: string;
  description?: string | null;
  content?: string;
  tags?: string[];
  status?: RuleStatus;
}
