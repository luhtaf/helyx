import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode, linkIocToGlobalIoc } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';
import { bulkParseIocs } from '../ioc-detect.js';

export const bulkIocResolvers = {
  Mutation: {
    bulkCreateIocArtifacts: async (
      _p: unknown,
      args: { caseId: string; base: BaseInputShape; values: string[] },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const items = bulkParseIocs(args.values.join('\n'));
      const created = [];
      for (const item of items) {
        const node = await createArtifactNode(
          ctx.activeOrgId,
          args.caseId,
          buildBase(args.base, 'IOC', ctx.user.id),
          {
            typeLabel: TYPE_TO_LABEL.IOC,
            typeFields: {
              iocType: item.iocType,
              value: item.value,
              direction: null,
              firstSeen: null,
              lastSeen: null,
              source: 'bulk-paste',
            },
          },
        );
        await linkIocToGlobalIoc(node.id, item.value);
        created.push(node);
      }
      return created;
    },
  },
};
