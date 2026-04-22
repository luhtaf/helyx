import type { MatchMode } from '../assets/types.js';

const TENANT_BASE = `
  MATCH (a:Asset {tenantId: $tenantId})-[:HAS_COMPONENT]->(c:SoftwareComponent)
        -[:OF_PRODUCT]->(p:Product)-[:HAS_CPE]->(cpe:CPE)<-[:AFFECTS]-(cve:CVE)
`;

export const TENANT_CVE_BASE: Record<MatchMode, string> = {
  EXACT: `
    ${TENANT_BASE}
    WHERE c.version IS NOT NULL AND cpe.version = c.version
  `,
  MAJOR_MINOR: `
    ${TENANT_BASE}
    WHERE c.version IS NOT NULL
    WITH a, cve, c, cpe, split(c.version, '.') AS vp
    WHERE size(vp) >= 2
      AND (cpe.version STARTS WITH (vp[0] + '.' + vp[1] + '.')
           OR cpe.version = (vp[0] + '.' + vp[1]))
  `,
  MAJOR: `
    ${TENANT_BASE}
    WHERE c.version IS NOT NULL
    WITH a, cve, c, cpe, split(c.version, '.') AS vp
    WHERE size(vp) >= 1
      AND (cpe.version STARTS WITH (vp[0] + '.')
           OR cpe.version = vp[0])
  `,
  BEAST: TENANT_BASE,
};
