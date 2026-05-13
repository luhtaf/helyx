import type { RequestContext } from '../auth/context.js';
import { assertAuthed } from '../auth/middleware.js';
import {
  getAttackPattern,
  listThreatActorsUsingTechnique,
  searchAttackPatterns,
  listSubtechniquesOf,
  getParentTechnique,
  type AttackPatternDetail,
} from './repo.js';

export const attackPatternResolvers = {
  Query: {
    attackPattern: async (_parent: unknown, args: { id: string }, ctx: RequestContext) => {
      assertAuthed(ctx);
      return getAttackPattern(args.id);
    },

    searchAttackPatterns: async (
      _p: unknown,
      args: { q: string; limit?: number },
      ctx: RequestContext,
    ) => {
      assertAuthed(ctx);
      return searchAttackPatterns(args.q, args.limit ?? 10);
    },
  },

  AttackPatternDetail: {
    threatActors: (parent: AttackPatternDetail, args: { limit?: number }) => {
      const limit = !args.limit || !Number.isInteger(args.limit) || args.limit <= 0
        ? 25
        : Math.min(args.limit, 100);
      return listThreatActorsUsingTechnique(parent.id, limit);
    },

    subtechniques: (parent: AttackPatternDetail, args: { limit?: number }) => {
      // Sub-technique queries are matrix-navigation usage. Cap at 50 —
      // T1003 has ~7 subs, T1059 has ~9; nothing realistic exceeds 25.
      const limit = !args.limit || !Number.isInteger(args.limit) || args.limit <= 0
        ? 50
        : Math.min(args.limit, 100);
      return listSubtechniquesOf(parent.id, limit);
    },

    parentTechnique: (parent: AttackPatternDetail) => {
      // Cheap: returns null without a DB hit when id has no '.'
      return getParentTechnique(parent.id);
    },
  },
};
