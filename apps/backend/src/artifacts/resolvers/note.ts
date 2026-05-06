import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface NoteInput {
  base: BaseInputShape;
  title?: string | null;
  body: string;
  author: string;
}

export const noteResolvers = {
  Mutation: {
    createNoteArtifact: async (
      _p: unknown,
      args: { caseId: string; input: NoteInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return createArtifactNode(
        ctx.activeOrgId,
        args.caseId,
        buildBase(args.input.base, 'NOTE', ctx.user.id),
        {
          typeLabel: TYPE_TO_LABEL.NOTE,
          typeFields: {
            title: args.input.title ?? null,
            body: args.input.body,
            author: args.input.author,
          },
        },
      );
    },
  },
};
