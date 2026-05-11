// Re-export from kinds.ts (the single source of truth). Adding a new kind /
// status / source = edit kinds.ts ONLY; everything below derives.
export { type RuleKind, type RuleStatus, type RuleSource } from './kinds.js';
import type { RuleKind, RuleStatus, RuleSource } from './kinds.js';
// F1 — release tier per rule (4-tier need-to-know enforcement). Default
// 'internal' for legacy rules created before m017; new rules default to
// 'internal' too — operator must opt into wider tiers explicitly.
export { type ReleaseTier } from '../cti/kinds.js';
import type { ReleaseTier } from '../cti/kinds.js';

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
  releaseTier: ReleaseTier;  // F1
  // F2 — approval state machine. approvedByUserId/approvedAt set when
  // an analyst approves the rule for release; approvalContentHash is
  // SHA-256(content) at approval time. If content changes after approval,
  // approval becomes stale (re-approval required). Stale = approvedAt
  // present but approvalContentHash != sha256(currentContent).
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvalContentHash: string | null;
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
