import { tenantTypeDefs } from '../tenants/schema.js';
import { assetTypeDefs } from '../assets/schema.js';
import { dashboardTypeDefs } from '../dashboard/schema.js';
import { cveTypeDefs } from '../cves/schema.js';
import { threatActorTypeDefs } from '../threat-actors/schema.js';
import { attackPatternTypeDefs } from '../attack-patterns/schema.js';
import { cweTypeDefs } from '../cwes/schema.js';
import { huntTypeDefs } from '../hunts/schema.js';

const coreTypeDefs = /* GraphQL */ `
  type Query {
    health: HealthStatus!
  }

  type HealthStatus {
    api: Boolean!
    db: Boolean!
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
];
