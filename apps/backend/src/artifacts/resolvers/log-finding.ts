import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface LogFindingInput {
  base: BaseInputShape;
  logSource: string;
  timestamp: string;
  observation: string;
  eventId?: string | null;
  rawLine?: string | null;
}

export const logFindingResolvers = {
  Mutation: {
    createLogFindingArtifact: async (
      _p: unknown,
      args: { caseId: string; input: LogFindingInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId!,
        args.caseId,
        buildBase(args.input.base, 'LOG_FINDING', ctx.user!.id),
        {
          typeLabel: TYPE_TO_LABEL.LOG_FINDING,
          typeFields: {
            logSource: args.input.logSource,
            eventId: args.input.eventId ?? null,
            timestamp: args.input.timestamp,
            rawLine: args.input.rawLine ?? null,
            observation: args.input.observation,
          },
        },
      );
      return created;
    },
  },
};
