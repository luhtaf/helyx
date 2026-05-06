import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface PersistenceInput {
  base: BaseInputShape;
  mechanism: 'SCHEDULED_TASK' | 'SERVICE' | 'STARTUP_FOLDER' | 'RUN_KEY' | 'WMI' | 'CRON' | 'SYSTEMD' | 'LAUNCHD' | 'OTHER';
  name: string;
  target?: string | null;
  user?: string | null;
  createdAtSrc?: string | null;
}

export const persistenceResolvers = {
  Mutation: {
    createPersistenceArtifact: async (
      _p: unknown,
      args: { caseId: string; input: PersistenceInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId!,
        args.caseId,
        buildBase(args.input.base, 'PERSISTENCE', ctx.user!.id),
        {
          typeLabel: TYPE_TO_LABEL.PERSISTENCE,
          typeFields: {
            mechanism: args.input.mechanism,
            name: args.input.name,
            target: args.input.target ?? null,
            user: args.input.user ?? null,
            createdAtSrc: args.input.createdAtSrc ?? null,
          },
        },
      );
      return created;
    },
  },
};
