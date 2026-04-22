import { pingDb } from '../db/neo4j.js';
import { logger } from '../logger.js';
import { authResolvers } from '../tenants/auth.resolvers.js';
import { orgResolvers } from '../tenants/org.resolvers.js';
import { assetResolvers } from '../assets/asset.resolvers.js';
import { sbomResolvers } from '../assets/sbom.resolvers.js';
import { dashboardResolvers } from '../dashboard/resolvers.js';
import { cveResolvers } from '../cves/resolvers.js';
import { threatActorResolvers } from '../threat-actors/resolvers.js';

const coreResolvers = {
  Query: {
    health: async () => ({
      api: true,
      db: await pingDb().catch((err) => {
        logger.warn({ err }, 'health: db ping failed');
        return false;
      }),
      serverTime: new Date().toISOString(),
    }),
  },
};

export const resolvers = {
  Query: {
    ...coreResolvers.Query,
    ...authResolvers.Query,
    ...orgResolvers.Query,
    ...assetResolvers.Query,
    ...dashboardResolvers.Query,
    ...cveResolvers.Query,
    ...threatActorResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...orgResolvers.Mutation,
    ...assetResolvers.Mutation,
    ...sbomResolvers.Mutation,
  },
  Organization: orgResolvers.Organization,
  Asset: assetResolvers.Asset,
  CveMatch: assetResolvers.CveMatch,
  TenantStats: dashboardResolvers.TenantStats,
  CveDetail: cveResolvers.CveDetail,
  AffectedAsset: cveResolvers.AffectedAsset,
  ThreatActor: threatActorResolvers.ThreatActor,
};
