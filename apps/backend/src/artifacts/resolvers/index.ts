import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { findAssetById } from '../../assets/assets.repo.js';
import { deleteArtifact } from '../repo.js';
import type { ArtifactBaseRow } from '../types.js';
import { pickArtifactGqlType } from './_shared.js';
import { iocResolvers } from './ioc.js';
import { fileResolvers } from './file.js';
import { processResolvers } from './process.js';
import { networkResolvers } from './network.js';
import { registryResolvers } from './registry.js';
import { persistenceResolvers } from './persistence.js';
import { accountResolvers } from './account.js';
import { logFindingResolvers } from './log-finding.js';
import { memoryResolvers } from './memory.js';
import { detectionHitResolvers } from './detection-hit.js';
import { noteResolvers } from './note.js';

export const artifactResolvers = {
  Artifact: {
    __resolveType: (parent: ArtifactBaseRow & { __labels?: string[] }) => {
      if (!parent.__labels) return 'NoteArtifact';
      return pickArtifactGqlType(parent.__labels);
    },
    host: (parent: ArtifactBaseRow & { hostAssetId?: string | null }, _a: unknown, ctx: RequestContext) =>
      parent.hostAssetId ? findAssetById(ctx.activeOrgId!, parent.hostAssetId) : null,
  },
  Mutation: {
    ...iocResolvers.Mutation,
    ...fileResolvers.Mutation,
    ...processResolvers.Mutation,
    ...networkResolvers.Mutation,
    ...registryResolvers.Mutation,
    ...persistenceResolvers.Mutation,
    ...accountResolvers.Mutation,
    ...logFindingResolvers.Mutation,
    ...memoryResolvers.Mutation,
    ...detectionHitResolvers.Mutation,
    ...noteResolvers.Mutation,
    deleteArtifact: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return deleteArtifact(ctx.activeOrgId!, args.id);
    },
  },
};
