import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  countAuditEvents,
  listAuditEvents,
  listDistinctAuditActions,
  type AuditEventListFilter,
} from './repo.js';
import type { AuditEventRow } from './types.js';
import { findUserById } from '../tenants/users.repo.js';

// Per-tenant audit reader. ANALYST role minimum — operators see their
// own + peers' actions; this is an accountability surface, not a
// security secret. The actorEmail / actorDisplayName fields are
// resolved per-row via field-level resolver below; for a small page
// (default 50) the N+1 cost is bounded and the cache layer hits often
// (most pages have a few repeating actors).

interface AuditEventFilterInput {
  action?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  since?: string | null;
  until?: string | null;
}

function clampPage(n: number | undefined): number {
  if (!n || !Number.isInteger(n) || n < 1) return 1;
  return n;
}
function clampPerPage(n: number | undefined, dflt: number, max: number): number {
  if (!n || !Number.isInteger(n) || n <= 0) return dflt;
  return Math.min(n, max);
}

function normalizeFilter(input: AuditEventFilterInput | undefined | null): AuditEventListFilter {
  return {
    action: input?.action?.trim() || null,
    actorUserId: input?.actorUserId?.trim() || null,
    targetType: input?.targetType?.trim() || null,
    since: input?.since || null,
    until: input?.until || null,
  };
}

// JSON-stringify the structured before/after columns for the wire so
// the FE can render them as a collapsible code block without coupling
// the schema to per-entity shapes. Returns null when the column is null.
function stringifyMaybe(v: Record<string, unknown> | null): string | null {
  if (v == null) return null;
  try { return JSON.stringify(v); } catch { return null; }
}

export const auditResolvers = {
  Query: {
    auditEvents: async (
      _p: unknown,
      args: { filter?: AuditEventFilterInput | null; page?: number; perPage?: number },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const page = clampPage(args.page);
      const perPage = clampPerPage(args.perPage, 50, 100);
      const filter = normalizeFilter(args.filter);
      const [items, total] = await Promise.all([
        listAuditEvents(ctx.activeOrgId, filter, page, perPage),
        countAuditEvents(ctx.activeOrgId, filter),
      ]);
      return { items, total, page, perPage };
    },

    auditActions: async (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return listDistinctAuditActions(ctx.activeOrgId);
    },
  },

  AuditEvent: {
    // Wire-shape transforms — keep the row → GraphQL type encoding here
    // so the repo can stay typed against AuditEventRow (Record values
    // for before/after) without leaking JSON.stringify into Cypher land.
    before: (parent: AuditEventRow): string | null => stringifyMaybe(parent.before),
    after:  (parent: AuditEventRow): string | null => stringifyMaybe(parent.after),

    // Actor join — fetch User by id, fall back to null when the user
    // was deleted (rare but happens). cacheWrap layer handles N+1
    // amplification across rows that share an actor.
    actorEmail: async (parent: AuditEventRow): Promise<string | null> => {
      const u = await findUserById(parent.actorUserId).catch(() => null);
      return u?.email ?? null;
    },
    actorDisplayName: async (parent: AuditEventRow): Promise<string | null> => {
      const u = await findUserById(parent.actorUserId).catch(() => null);
      return u?.displayName ?? null;
    },
  },
};
