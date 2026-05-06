import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode, linkIocToGlobalIoc } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface IocInput {
  base: BaseInputShape;
  iocType: 'IP' | 'DOMAIN' | 'URL' | 'EMAIL' | 'HASH';
  value: string;
  direction?: 'INBOUND' | 'OUTBOUND' | 'BOTH' | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  source?: string | null;
}

export const iocResolvers = {
  Mutation: {
    createIocArtifact: async (
      _p: unknown,
      args: { caseId: string; input: IocInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId,
        args.caseId,
        buildBase(args.input.base, 'IOC', ctx.user.id),
        {
          typeLabel: TYPE_TO_LABEL.IOC,
          typeFields: {
            iocType: args.input.iocType,
            value: args.input.value,
            direction: args.input.direction ?? null,
            firstSeen: args.input.firstSeen ?? null,
            lastSeen: args.input.lastSeen ?? null,
            source: args.input.source ?? null,
          },
        },
      );
      await linkIocToGlobalIoc(created.id, args.input.value);
      return created;
    },
  },
};
