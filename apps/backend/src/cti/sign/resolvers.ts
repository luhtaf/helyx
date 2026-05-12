import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../../auth/middleware.js';
import type { RequestContext } from '../../auth/context.js';
import {
  listOrgKeypairs,
  rotateOrgKeypair,
  revokeOrgKeypair,
  type OrgKeypairSummary,
} from './keypair.js';

// Resolvers stay thin — repo functions take primitives. Auth is OWNER for
// mutations (rotation/revoke = high blast radius: bad rotation breaks all
// downstream verification, bad revoke flags historical bundles as untrusted).
// Listing is ANALYST so non-owners can audit who currently signs and when.

function notEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new GraphQLError(`${field} is required`, { extensions: { code: 'BAD_INPUT', field } });
  }
}

export const ctiKeypairResolvers = {
  Query: {
    async ctiOrgKeypairs(_p: unknown, _a: unknown, ctx: RequestContext): Promise<OrgKeypairSummary[]> {
      assertOrgRole(ctx, 'ANALYST');
      return listOrgKeypairs(ctx.activeOrgId);
    },
  },
  Mutation: {
    async rotateCtiKeypair(
      _p: unknown,
      args: { reason: string },
      ctx: RequestContext,
    ): Promise<OrgKeypairSummary> {
      assertOrgRole(ctx, 'OWNER');
      notEmpty(args.reason, 'reason');
      const { newKeypair } = await rotateOrgKeypair(ctx.activeOrgId, ctx.user.id, args.reason.trim());
      return newKeypair;
    },

    async revokeCtiKeypair(
      _p: unknown,
      args: { keypairId: string; reason: string },
      ctx: RequestContext,
    ): Promise<OrgKeypairSummary> {
      assertOrgRole(ctx, 'OWNER');
      notEmpty(args.reason, 'reason');
      try {
        const revoked = await revokeOrgKeypair(
          ctx.activeOrgId,
          args.keypairId,
          ctx.user.id,
          args.reason.trim(),
        );
        if (!revoked) {
          throw new GraphQLError('keypair not found', {
            extensions: { code: 'NOT_FOUND', keypairId: args.keypairId },
          });
        }
        return revoked;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes('cannot revoke the active keypair')) {
          throw new GraphQLError(msg, {
            extensions: { code: 'CTI_KEYPAIR_ACTIVE', keypairId: args.keypairId },
          });
        }
        throw e;
      }
    },
  },
};
