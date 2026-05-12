import type { RequestContext } from '../auth/context.js';
import { assertAuthed } from '../auth/middleware.js';
import {
  countThreatActors,
  findThreatActorById,
  guessActorByTtps,
  listTechniquesUsedBy,
  listThreatActors,
  type ThreatActorRow,
} from './repo.js';

export const threatActorResolvers = {
  Query: {
    threatActor: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertAuthed(ctx);
      return findThreatActorById(args.id);
    },

    threatActors: async (
      _p: unknown,
      args: { search?: string | null; page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertAuthed(ctx);
      const page = !args.page || !Number.isInteger(args.page) || args.page < 1 ? 1 : args.page;
      const perPage = !args.perPage || !Number.isInteger(args.perPage) || args.perPage <= 0
        ? 25 : Math.min(args.perPage, 100);
      const filters = { search: args.search ?? null };
      const [items, total] = await Promise.all([
        listThreatActors({ ...filters, page, perPage }),
        countThreatActors(filters),
      ]);
      return { items, total, page, perPage };
    },

    guessActorByTtps: async (
      _p: unknown,
      args: { techniqueIds: string[]; limit?: number | null },
      ctx: RequestContext,
    ) => {
      assertAuthed(ctx);
      // Strict T-code regex at the boundary — empty/garbage input → [].
      const valid = (args.techniqueIds ?? [])
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => /^T\d{4}(\.\d{3})?$/.test(s));
      if (valid.length === 0) return [];
      const limit = args.limit && Number.isInteger(args.limit) && args.limit > 0
        ? Math.min(args.limit, 50) : 20;
      return guessActorByTtps(valid, limit);
    },
  },

  ThreatActor: {
    techniques: (parent: ThreatActorRow) => listTechniquesUsedBy(parent.id),
  },
};
