import type { MatchMode } from '../assets/types.js';

// Tail-half of the Asset→...→CVE chain — same for every entry point.
const CHAIN_TAIL = `
  -[:HAS_COMPONENT]->(c:SoftwareComponent)
  -[:OF_PRODUCT]->(p:Product)-[:HAS_CPE]->(cpe:CPE)<-[:AFFECTS]-(cve:CVE)
`;

const TENANT_BASE = `
  MATCH (a:Asset {tenantId: $tenantId})${CHAIN_TAIL}
`;

function withModeFilter(base: string, mode: MatchMode): string {
  switch (mode) {
    case 'EXACT':
      return `${base}\n  WHERE c.version IS NOT NULL AND cpe.version = c.version`;
    case 'MAJOR_MINOR':
      return `
        ${base}
        WHERE c.version IS NOT NULL
        WITH a, cve, c, cpe, split(c.version, '.') AS vp
        WHERE size(vp) >= 2
          AND (cpe.version STARTS WITH (vp[0] + '.' + vp[1] + '.')
               OR cpe.version = (vp[0] + '.' + vp[1]))
      `;
    case 'MAJOR':
      return `
        ${base}
        WHERE c.version IS NOT NULL
        WITH a, cve, c, cpe, split(c.version, '.') AS vp
        WHERE size(vp) >= 1
          AND (cpe.version STARTS WITH (vp[0] + '.')
               OR cpe.version = vp[0])
      `;
    case 'BEAST':
      return base;
  }
}

export const TENANT_CVE_BASE: Record<MatchMode, string> = {
  EXACT: withModeFilter(TENANT_BASE, 'EXACT'),
  MAJOR_MINOR: withModeFilter(TENANT_BASE, 'MAJOR_MINOR'),
  MAJOR: withModeFilter(TENANT_BASE, 'MAJOR'),
  BEAST: withModeFilter(TENANT_BASE, 'BEAST'),
};

// Stakeholder-rooted: UNIONs two CVE sources via CALL subquery.
//   1. SBOM-style chain: Asset→HAS_COMPONENT→...→CVE (mode-filtered)
//   2. Direct attribution: Asset→ATTRIBUTED_CVE→CVE (external scanner)
//
// Mode only affects path 1. Path 2 represents external ground truth where
// the scanner already correlated banner/version → CVE; reapplying our
// version logic would discard data, so it's emitted unfiltered.
//
// Per owner's rule, OUR match decisions never persist as edges. The
// :ATTRIBUTED_CVE edge is the EXTERNAL attribution slot — provenance is
// stamped on edge.source ('spiderfoot' | 'snyk' | etc.). Different
// problem, different relationship type, no rule violation.
function chainBranchVersionWhere(mode: MatchMode): string {
  switch (mode) {
    case 'EXACT':
      return 'WHERE c.version IS NOT NULL AND cpe.version = c.version';
    case 'MAJOR_MINOR':
      return `WHERE c.version IS NOT NULL
              AND size(split(c.version, '.')) >= 2
              AND (cpe.version STARTS WITH (split(c.version, '.')[0] + '.' + split(c.version, '.')[1] + '.')
                   OR cpe.version = (split(c.version, '.')[0] + '.' + split(c.version, '.')[1]))`;
    case 'MAJOR':
      return `WHERE c.version IS NOT NULL
              AND size(split(c.version, '.')) >= 1
              AND (cpe.version STARTS WITH (split(c.version, '.')[0] + '.')
                   OR cpe.version = split(c.version, '.')[0])`;
    case 'BEAST':
      return '';
  }
}

function stakeholderCveCypher(mode: MatchMode): string {
  return `
    MATCH (k:Stakeholder {id: $stakeholderId, tenantId: $tenantId})
      -[:OWNS]->(a:Asset {tenantId: $tenantId})
    CALL {
      WITH a
      MATCH (a)${CHAIN_TAIL}
      ${chainBranchVersionWhere(mode)}
      RETURN cve
      UNION
      WITH a
      MATCH (a)-[:ATTRIBUTED_CVE]->(cve:CVE)
      RETURN cve
    }
    WITH a, cve
  `;
}

export const STAKEHOLDER_CVE_BASE: Record<MatchMode, string> = {
  EXACT: stakeholderCveCypher('EXACT'),
  MAJOR_MINOR: stakeholderCveCypher('MAJOR_MINOR'),
  MAJOR: stakeholderCveCypher('MAJOR'),
  BEAST: stakeholderCveCypher('BEAST'),
};
