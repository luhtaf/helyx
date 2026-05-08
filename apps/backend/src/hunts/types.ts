export type HuntStatus = 'ACTIVE' | 'ARCHIVED';
export type HuntKind = 'STRUCTURED' | 'GRAPH';

export interface HuntRecord {
  id: string;
  tenantId: string;
  name: string;
  kind: HuntKind;
  status: HuntStatus;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  targetActorCount: number;
  scopedAssetCount: number;
  graphSnapshot: string | null;
  graphSeedType: string | null;
  graphSeedId: string | null;
}

export interface SearchEntityResult {
  type: string;
  id: string;
  label: string;
  detail: string | null;
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
