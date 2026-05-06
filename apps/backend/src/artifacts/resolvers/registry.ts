import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface RegistryInput {
  base: BaseInputShape;
  hive: 'HKLM' | 'HKCU' | 'HKCR' | 'HKU' | 'HKCC';
  keyPath: string;
  valueName?: string | null;
  valueData?: string | null;
  action: 'CREATED' | 'MODIFIED' | 'DELETED';
}

export const registryResolvers = {
  Mutation: {
    createRegistryArtifact: async (
      _p: unknown,
      args: { caseId: string; input: RegistryInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId!,
        args.caseId,
        buildBase(args.input.base, 'REGISTRY', ctx.user!.id),
        {
          typeLabel: TYPE_TO_LABEL.REGISTRY,
          typeFields: {
            hive: args.input.hive,
            keyPath: args.input.keyPath,
            valueName: args.input.valueName ?? null,
            valueData: args.input.valueData ?? null,
            action: args.input.action,
          },
        },
      );
      return created;
    },
  },
};
