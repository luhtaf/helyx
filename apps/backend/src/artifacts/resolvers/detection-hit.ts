import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode, linkDetectionHitToRule } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface DetectionHitInput {
  base: BaseInputShape;
  ruleSource: 'SIGMA' | 'YARA' | 'WAZUH' | 'ELASTIC' | 'CUSTOM';
  ruleId: string;
  ruleName: string;
  firedAt: string;
  count?: number | null;
}

export const detectionHitResolvers = {
  Mutation: {
    createDetectionHitArtifact: async (
      _p: unknown,
      args: { caseId: string; input: DetectionHitInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId,
        args.caseId,
        buildBase(args.input.base, 'DETECTION_HIT', ctx.user.id),
        {
          typeLabel: TYPE_TO_LABEL.DETECTION_HIT,
          typeFields: {
            ruleSource: args.input.ruleSource,
            ruleId: args.input.ruleId,
            ruleName: args.input.ruleName,
            firedAt: args.input.firedAt,
            count: args.input.count ?? null,
          },
        },
      );
      await linkDetectionHitToRule(created.id, args.input.ruleId);
      return created;
    },
  },
};
