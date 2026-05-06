import type { RequestContext } from '../auth/context.js';
import { assertAuthed } from '../auth/middleware.js';
import {
  findTacticById,
  getMatrix,
  listTactics,
  listTechniquesForTactic,
  listTopActorsForTactic,
  type TacticDetailRow,
} from './repo.js';

export const tacticResolvers = {
  Query: {
    tactics: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertAuthed(ctx);
      return listTactics();
    },
    matrix: (
      _p: unknown,
      args: { filter?: { platform?: string | null; search?: string | null } },
      ctx: RequestContext,
    ) => {
      assertAuthed(ctx);
      return getMatrix(args.filter ?? {});
    },
    tactic: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertAuthed(ctx);
      return findTacticById(args.id);
    },
  },
  TacticDetail: {
    techniques: (parent: TacticDetailRow) => listTechniquesForTactic(parent.id),
    topActors: (parent: TacticDetailRow, args: { limit?: number }) => {
      const limit = !args.limit || !Number.isInteger(args.limit) || args.limit <= 0
        ? 25
        : Math.min(args.limit, 100);
      return listTopActorsForTactic(parent.id, limit);
    },
  },
};
