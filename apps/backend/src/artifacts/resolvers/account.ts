import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface AccountInput {
  base: BaseInputShape;
  username: string;
  action: 'CREATED' | 'PRIVILEGE_ESCALATED' | 'DISABLED' | 'PASSWORD_CHANGED' | 'LOGIN_ANOMALY';
  domain?: string | null;
  privileges?: string[] | null;
  sourceIp?: string | null;
}

export const accountResolvers = {
  Mutation: {
    createAccountArtifact: async (
      _p: unknown,
      args: { caseId: string; input: AccountInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId!,
        args.caseId,
        buildBase(args.input.base, 'ACCOUNT', ctx.user!.id),
        {
          typeLabel: TYPE_TO_LABEL.ACCOUNT,
          typeFields: {
            username: args.input.username,
            domain: args.input.domain ?? null,
            action: args.input.action,
            privileges: args.input.privileges ?? [],
            sourceIp: args.input.sourceIp ?? null,
          },
        },
      );
      return created;
    },
  },
};
