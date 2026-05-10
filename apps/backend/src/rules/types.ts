export type RuleKind = 'YARA' | 'SURICATA' | 'SIGMA' | 'OWASP' | 'CUSTOM';
export type RuleStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
export type RuleSource = 'manual' | 'sigma-community' | 'otx' | 'helyx-generated' | 'imported-stix' | 'imported-openioc';

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
