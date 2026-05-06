import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNodesBulk, linkIocToGlobalIoc, type BulkCreateRequest } from '../repo.js';
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
      if (items.length === 0) return [];

      const requests: BulkCreateRequest[] = items.map((item) => ({
        base: buildBase(args.base, 'IOC', ctx.user!.id),
        spec: {
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
      }));

      const created = await createArtifactNodesBulk(ctx.activeOrgId!, args.caseId, requests);

      // Auto-link runs AFTER atomic create — best-effort, doesn't roll back
      await Promise.all(
        created.map((node, i) =>
          linkIocToGlobalIoc(node.id, items[i]!.value).catch(() => undefined),
        ),
      );
      return created;
    },
  },
};
