// FE single source of truth for asset + match-mode enums.
// Mirror of backend assets/types.ts (which already exports ASSET_KINDS +
// MATCH_MODES). Adding a kind = edit BOTH this file AND the backend twin.

export const ASSET_KINDS = [
  'HOST', 'HYPERVISOR', 'VM', 'CONTAINER',
  'K8S_CLUSTER', 'K8S_NODE', 'K8S_POD', 'IMAGE', 'APPLICATION',
] as const;

export const MATCH_MODES = ['EXACT', 'MAJOR_MINOR', 'MAJOR', 'BEAST'] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];
export type MatchMode = (typeof MATCH_MODES)[number];

// Compact label form for chips — full form ("MAJOR_MINOR") is too noisy
// in a 4-up filter row. Full enum value still shown in queries / URLs.
export const MATCH_MODE_LABELS: Record<MatchMode, string> = {
  EXACT:       'exact',
  MAJOR_MINOR: 'maj.min',
  MAJOR:       'maj',
  BEAST:       'beast',
};
