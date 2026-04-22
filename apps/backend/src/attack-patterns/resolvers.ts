import type { RequestContext } from '../auth/context.js';
import { assertAuthed } from '../auth/middleware.js';
import {
  getAttackPattern,
  listThreatActorsUsingTechnique,
  type AttackPatternDetail,
} from './repo.js';

export const attackPatternResolvers = {
  Query: {
    attackPattern: async (_parent: unknown, args: { id: string }, ctx: RequestContext) => {
      assertAuthed(ctx);
      return getAttackPattern(args.id);
    },
  },

  AttackPatternDetail: {
    threatActors: (parent: AttackPatternDetail, args: { limit?: number }) => {
      const limit = !args.limit || !Number.isInteger(args.limit) || args.limit <= 0
        ? 25
        : Math.min(args.limit, 100);
      return listThreatActorsUsingTechnique(parent.id, limit);
    },
  },
};
