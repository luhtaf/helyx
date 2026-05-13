import { tenantTypeDefs } from '../tenants/schema.js';
import { assetTypeDefs } from '../assets/schema.js';
import { dashboardTypeDefs } from '../dashboard/schema.js';
import { cveTypeDefs } from '../cves/schema.js';
import { threatActorTypeDefs } from '../threat-actors/schema.js';
import { attackPatternTypeDefs } from '../attack-patterns/schema.js';
import { cweTypeDefs } from '../cwes/schema.js';
import { huntTypeDefs } from '../hunts/schema.js';
import { tacticTypeDefs } from '../tactics/schema.js';
import { stakeholderTypeDefs } from '../stakeholders/schema.js';
import { reconciliationTypeDefs } from '../reconciliation/schema.js';
import { artifactTypeDefs } from '../artifacts/schema.js';
import { caseTypeDefs } from '../cases/schema.js';
import { ruleTypeDefs } from '../rules/schema.js';
import { ctiIocsTypeDefs } from '../cti/iocs/schema.js';
import { auditTypeDefs } from '../audits/schema.js';
import { otxTypeDefs } from '../sources/otx/schema.js';
import { ctiKeypairTypeDefs } from '../cti/sign/schema.js';
import { ctiRedactionTypeDefs } from '../cti/redaction/schema.js';

const coreTypeDefs = /* GraphQL */ `
  type Query {
    health: HealthStatus!
  }

  type HealthStatus {
    api: Boolean!
    db: Boolean!
    cache: Boolean!
    serverTime: String!
  }
`;

export const typeDefs = [
  coreTypeDefs,
  tenantTypeDefs,
  assetTypeDefs,
  dashboardTypeDefs,
  cveTypeDefs,
  threatActorTypeDefs,
  attackPatternTypeDefs,
  cweTypeDefs,
  huntTypeDefs,
  tacticTypeDefs,
  stakeholderTypeDefs,
  reconciliationTypeDefs,
  artifactTypeDefs,
  caseTypeDefs,
  ruleTypeDefs,
  ctiIocsTypeDefs,
  auditTypeDefs,
  otxTypeDefs,
  ctiKeypairTypeDefs,
  ctiRedactionTypeDefs,
];
