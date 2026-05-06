import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode, linkProcessToTtp } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface ProcessInput {
  base: BaseInputShape;
  name: string;
  pid?: number | null;
  commandLine?: string | null;
  parentName?: string | null;
  user?: string | null;
  startedAt?: string | null;
  ttpHints?: string[] | null;
}

export const processResolvers = {
  Mutation: {
    createProcessArtifact: async (
      _p: unknown,
      args: { caseId: string; input: ProcessInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId!,
        args.caseId,
        buildBase(args.input.base, 'PROCESS', ctx.user!.id),
        {
          typeLabel: TYPE_TO_LABEL.PROCESS,
          typeFields: {
            name: args.input.name,
            pid: args.input.pid ?? null,
            commandLine: args.input.commandLine ?? null,
            parentName: args.input.parentName ?? null,
            user: args.input.user ?? null,
            startedAt: args.input.startedAt ?? null,
            ttpHints: args.input.ttpHints ?? [],
          },
        },
      );
      if (args.input.ttpHints?.length) {
        await linkProcessToTtp(created.id, args.input.ttpHints);
      }
      return created;
    },
  },
};
