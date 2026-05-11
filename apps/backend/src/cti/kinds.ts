// Single source of truth for CTI feature enums (release control + egress).
// Train 1 scope: RELEASE_TIERS + CTI_EGRESS_MODES.
// Train 2-5 will extend with CTI_PLATFORMS, DEPLOYMENT_TARGETS,
// CTI_SIGHTING_SOURCES, etc — add to THIS file when their trains land,
// never inline elsewhere (see feedback_dry_from_day_one memory).

// 4-tier need-to-know enforcement per Copilot national-grade finding F1.
// Lower tier = wider sharing. Push enforcement: rule.releaseTier ≤ target.maxTier.
//   public        — vendor advisories, public IOCs, openly shareable
//   cross-agency  — BSSN ↔ BPOM ↔ Kemenkominfo, sector-spanning
//   sectoral      — within one sector (banking ISAC, energy ISAC, etc.)
//   internal      — single-agency operational, never federated
export const RELEASE_TIERS = ['public', 'cross-agency', 'sectoral', 'internal'] as const;
export type ReleaseTier = (typeof RELEASE_TIERS)[number];

// Numeric rank — larger = more restrictive. Used by enforcement Cypher
// (`WHERE rule.releaseTierRank <= target.maxTierRank`). Derived from array
// index so order in RELEASE_TIERS = canonical rank.
export const RELEASE_TIER_RANK: Record<ReleaseTier, number> = Object.fromEntries(
  RELEASE_TIERS.map((tier, i) => [tier, i]),
) as Record<ReleaseTier, number>;

// PDN = Pusat Data Nasional (Indonesian national data center). pdn-only
// mode rejects all egress to non-PDN domains — required for sovereign
// data residency compliance per F3.
export const CTI_EGRESS_MODES = ['unrestricted', 'pdn-only'] as const;
export type CtiEgressMode = (typeof CTI_EGRESS_MODES)[number];

// PDN allowlist patterns (matched as suffix). When CTI_EGRESS_MODE=pdn-only,
// any push target hostname must end with one of these.
export const PDN_ALLOWED_SUFFIXES = ['.pdn.go.id', '.bssn.go.id', 'localhost'] as const;

// W2.5 — IOC type enum for tenant intel-pool :CtiIoc nodes. Re-exported
// from artifacts/kinds.ts (same canonical values: IP/DOMAIN/URL/EMAIL/HASH).
// Importing through cti/kinds.ts keeps cti consumers from reaching
// across feature boundaries directly.
export { IOC_TYPES, type IocType } from '../artifacts/kinds.js';
