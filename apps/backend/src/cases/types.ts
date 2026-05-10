export { type CaseStatus, type CaseVerdict } from './kinds.js';
import type { CaseStatus, CaseVerdict } from './kinds.js';

export interface CaseRow {
  id: string;
  reportNo: string;
  title: string | null;
  trigger: string | null;
  summary: string | null;
  status: CaseStatus;
  verdict: CaseVerdict | null;
  deployedAt: string;
  closedAt: string | null;
  stakeholderId: string;
  leadUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseInput {
  reportNo: string;
  title?: string;
  trigger?: string;
  summary?: string;
  stakeholderId: string;
  leadUserId?: string;
  deployedAt: string; // ISO date
  status?: CaseStatus; // default DRAFT
}

export interface CaseUpdateInput {
  title?: string;
  trigger?: string;
  summary?: string;
  status?: CaseStatus;
  leadUserId?: string;
}

export interface ArtifactCounts {
  ioc: number;
  file: number;
  process: number;
  network: number;
  registry: number;
  persistence: number;
  account: number;
  logFinding: number;
  memory: number;
  detectionHit: number;
  note: number;
}
