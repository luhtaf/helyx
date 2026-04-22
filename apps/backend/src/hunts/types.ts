export type HuntStatus = 'ACTIVE' | 'ARCHIVED';

export interface HuntRecord {
  id: string;
  tenantId: string;
  name: string;
  status: HuntStatus;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  targetActorCount: number;
  scopedAssetCount: number;
}

export interface HuntActorRef {
  id: string;
  name: string;
  techniqueCount: number;
}

export interface HuntAssetRef {
  id: string;
  name: string;
  kind: string;
}

export interface HuntTtpRow {
  id: string;
  name: string;
  killChainPhases: string[];
  actorCount: number;
}

export interface HuntCveRow {
  cveId: string;
  description: string | null;
  severity: string | null;
  baseScore: number | null;
  affectedAssetCount: number;
}
