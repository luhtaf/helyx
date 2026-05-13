import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../../auth/middleware.js';
import type { RequestContext } from '../../auth/context.js';
import { logAudit } from '../../audits/log.js';
import {
  listRedactionProfiles,
  setHuntRedactionProfile,
  getRedactionProfile,
} from './repo.js';
import type { RedactionProfile } from './types.js';

export const ctiRedactionResolvers = {
  Query: {
    async redactionProfiles(
      _p: unknown, _a: unknown, ctx: RequestContext,
    ): Promise<RedactionProfile[]> {
      assertOrgRole(ctx, 'ANALYST');
      return listRedactionProfiles(ctx.activeOrgId);
    },
  },
  Mutation: {
    async setHuntRedactionProfile(
      _p: unknown,
      args: { huntId: string; profileId: string | null },
      ctx: RequestContext,
    ): Promise<string | null> {
      assertOrgRole(ctx, 'ANALYST');

      // Verify cross-tenant: a profileId must belong to the active org.
      // Without this check, an analyst on org A could pin a profile from
      // org B (no leakage of B's profile contents but a confused export).
      let profileSummary: string | null = null;
      if (args.profileId) {
        const profile = await getRedactionProfile(ctx.activeOrgId, args.profileId);
        if (!profile) {
          throw new GraphQLError('redaction profile not found in this org', {
            extensions: { code: 'NOT_FOUND', profileId: args.profileId },
          });
        }
        profileSummary = `${profile.slug} (${profile.name})`;
      }

      const ok = await setHuntRedactionProfile(ctx.activeOrgId, args.huntId, args.profileId);
      if (!ok) {
        throw new GraphQLError('hunt not found', {
          extensions: { code: 'NOT_FOUND', huntId: args.huntId },
        });
      }

      await logAudit(
        ctx.activeOrgId,
        ctx.user.id,
        'hunt.set_redaction_profile',
        { type: 'Hunt', id: args.huntId },
        null,
        { profileId: args.profileId, profile: profileSummary },
      );

      return args.profileId;
    },
  },
};
