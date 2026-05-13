import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../auth/middleware.js';
import type { RequestContext } from '../auth/context.js';
import { logAudit } from '../audits/log.js';
import {
  listNotesFor, createNote, updateNote, deleteNote, getNote,
  type NoteRecord,
} from './repo.js';

const MAX_BODY = 10_000; // ~10KB markdown — anything larger is an artifact, not a note

function notEmpty(s: string, field: string): void {
  if (s.trim().length === 0) {
    throw new GraphQLError(`${field} is required`, {
      extensions: { code: 'BAD_INPUT', field },
    });
  }
  if (s.length > MAX_BODY) {
    throw new GraphQLError(`${field} too long (max ${MAX_BODY} chars)`, {
      extensions: { code: 'BAD_INPUT', field, max: MAX_BODY },
    });
  }
}

/** Author check — original author OR org OWNER can mutate. Tenant
 *  guard is implicit (note was already loaded by getNote). Caller
 *  must run assertOrgRole first so userId/role are non-null. */
function assertCanMutate(note: NoteRecord, userId: string, role: string | null): void {
  if (note.authorUserId === userId) return;
  if (role === 'OWNER') return;
  throw new GraphQLError('only the author or org owner can modify this note', {
    extensions: { code: 'FORBIDDEN', noteId: note.id },
  });
}

export const noteResolvers = {
  Query: {
    async notesFor(
      _p: unknown,
      args: { entityType: string; entityId: string },
      ctx: RequestContext,
    ): Promise<NoteRecord[]> {
      assertOrgRole(ctx, 'ANALYST');
      return listNotesFor(ctx.activeOrgId, args.entityType, args.entityId);
    },
  },
  Mutation: {
    async createNote(
      _p: unknown,
      args: { entityType: string; entityId: string; body: string },
      ctx: RequestContext,
    ): Promise<NoteRecord> {
      assertOrgRole(ctx, 'ANALYST');
      notEmpty(args.body, 'body');
      const created = await createNote(
        ctx.activeOrgId, ctx.user.id,
        args.entityType, args.entityId, args.body,
      );
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'note.create',
        { type: 'Note', id: created.id },
        null,
        { entityType: args.entityType, entityId: args.entityId, bodyLength: args.body.length },
      );
      return created;
    },

    async updateNote(
      _p: unknown,
      args: { id: string; body: string },
      ctx: RequestContext,
    ): Promise<NoteRecord> {
      assertOrgRole(ctx, 'ANALYST');
      notEmpty(args.body, 'body');
      const before = await getNote(ctx.activeOrgId, args.id);
      if (!before) {
        throw new GraphQLError('note not found', {
          extensions: { code: 'NOT_FOUND', noteId: args.id },
        });
      }
      assertCanMutate(before, ctx.user.id, ctx.activeOrgRole);
      const updated = await updateNote(ctx.activeOrgId, args.id, args.body);
      if (!updated) {
        throw new GraphQLError('note vanished between read and write (race)', {
          extensions: { code: 'NOT_FOUND', noteId: args.id },
        });
      }
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'note.update',
        { type: 'Note', id: args.id },
        { bodyLength: before.body.length },
        { bodyLength: args.body.length },
      );
      return updated;
    },

    async deleteNote(
      _p: unknown,
      args: { id: string },
      ctx: RequestContext,
    ): Promise<boolean> {
      assertOrgRole(ctx, 'ANALYST');
      const before = await getNote(ctx.activeOrgId, args.id);
      if (!before) return false;
      assertCanMutate(before, ctx.user.id, ctx.activeOrgRole);
      const ok = await deleteNote(ctx.activeOrgId, args.id);
      if (ok) {
        await logAudit(
          ctx.activeOrgId, ctx.user.id,
          'note.delete',
          { type: 'Note', id: args.id },
          { entityType: before.entityType, entityId: before.entityId },
          null,
        );
      }
      return ok;
    },
  },
};
