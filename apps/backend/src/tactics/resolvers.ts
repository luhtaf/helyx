import type { RequestContext } from '../auth/context.js';
import { assertAuthed } from '../auth/middleware.js';
import { getMatrix, listTactics } from './repo.js';

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
  },
};
