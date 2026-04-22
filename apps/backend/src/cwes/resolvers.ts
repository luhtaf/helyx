import type { RequestContext } from '../auth/context.js';
import { assertAuthed } from '../auth/middleware.js';
import {
  countCvesWithCwe,
  getCwe,
  listCvesWithCwe,
  type CweDetail,
} from './repo.js';

function clampPage(raw: number | undefined): number {
  if (!raw || !Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

function clampPerPage(raw: number | undefined, dflt: number, max: number): number {
  if (!raw || !Number.isInteger(raw) || raw <= 0) return dflt;
  return Math.min(raw, max);
}

export const cweResolvers = {
  Query: {
    cwe: async (_parent: unknown, args: { id: string }, ctx: RequestContext) => {
      assertAuthed(ctx);
      const cwe = await getCwe(args.id);
      if (!cwe) return null;
      return { ...cwe };
    },
  },

  CweDetail: {
    cves: async (parent: CweDetail, args: { page?: number; perPage?: number }) => {
      const page = clampPage(args.page);
      const perPage = clampPerPage(args.perPage, 25, 100);
      const [items, total] = await Promise.all([
        listCvesWithCwe(parent.id, page, perPage),
        countCvesWithCwe(parent.id),
      ]);
      return { items, total, page, perPage };
    },
  },
};
