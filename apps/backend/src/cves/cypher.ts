import type { MatchMode } from '../assets/types.js';

// Tail-half of the chain — same for every entry point.
const CHAIN_TAIL = `
  -[:HAS_COMPONENT]->(c:SoftwareComponent)
  -[:OF_PRODUCT]->(p:Product)-[:HAS_CPE]->(cpe:CPE)<-[:AFFECTS]-(cve:CVE)
`;

const TENANT_BASE = `
  MATCH (a:Asset {tenantId: $tenantId})${CHAIN_TAIL}
`;

// Stakeholder-rooted: Stakeholder→OWNS→Asset→...→CVE.
// Asset stays tenant-scoped (defense in depth even though Stakeholder ownership
// already implies tenant equality).
const STAKEHOLDER_BASE = `
  MATCH (k:Stakeholder {id: $stakeholderId, tenantId: $tenantId})
  -[:OWNS]->(a:Asset {tenantId: $tenantId})${CHAIN_TAIL}
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

export const STAKEHOLDER_CVE_BASE: Record<MatchMode, string> = {
  EXACT: withModeFilter(STAKEHOLDER_BASE, 'EXACT'),
  MAJOR_MINOR: withModeFilter(STAKEHOLDER_BASE, 'MAJOR_MINOR'),
  MAJOR: withModeFilter(STAKEHOLDER_BASE, 'MAJOR'),
  BEAST: withModeFilter(STAKEHOLDER_BASE, 'BEAST'),
};
