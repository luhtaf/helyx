export type AssetKind =
  | 'HOST'
  | 'HYPERVISOR'
  | 'VM'
  | 'CONTAINER'
  | 'K8S_CLUSTER'
  | 'K8S_NODE'
  | 'K8S_POD'
  | 'IMAGE'
  | 'APPLICATION';

export const ASSET_KINDS: readonly AssetKind[] = [
  'HOST', 'HYPERVISOR', 'VM', 'CONTAINER',
  'K8S_CLUSTER', 'K8S_NODE', 'K8S_POD', 'IMAGE', 'APPLICATION',
] as const;

export type MatchMode = 'EXACT' | 'MAJOR_MINOR' | 'MAJOR' | 'BEAST';

export const MATCH_MODES: readonly MatchMode[] = ['EXACT', 'MAJOR_MINOR', 'MAJOR', 'BEAST'] as const;

export interface AssetRecord {
  id: string;
  tenantId: string;
  kind: AssetKind;
  name: string;
  hostname: string | null;
  ipAddresses: string[];
  createdAt: string;
  updatedAt: string;
  childCount: number;
}

export interface SoftwareComponentRecord {
  id: string;
  tenantId: string;
  purl: string;
  name: string;
  version: string | null;
  type: string | null;
  cpeUri: string | null;
}

export interface CveMatchRecord {
  cveId: string;
  description: string | null;
  cvssV31BaseScore: number | null;
  cvssV31BaseSeverity: string | null;
  publishedAt: string | null;
  componentPurl: string;
  cpeUri: string;
  mode: MatchMode;
}
