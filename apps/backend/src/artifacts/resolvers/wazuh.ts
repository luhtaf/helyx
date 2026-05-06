import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode, linkDetectionHitToRule } from '../repo.js';
import { TYPE_TO_LABEL, buildBase } from './_shared.js';
import { parseWazuhAlert } from '../wazuh-parser.js';

export const wazuhResolvers = {
  Mutation: {
    importWazuhAlert: async (
      _p: unknown,
      args: { caseId: string; alertJson: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const parsed = parseWazuhAlert(args.alertJson);
      const out = [];
      const dh = await createArtifactNode(
        ctx.activeOrgId,
        args.caseId,
        buildBase(
          { observedAt: parsed.detectionHit.firedAt, severity: parsed.detectionHit.severity, confidence: 'MEDIUM' },
          'DETECTION_HIT',
          ctx.user.id,
        ),
        {
          typeLabel: TYPE_TO_LABEL.DETECTION_HIT,
          typeFields: {
            ruleSource: 'WAZUH',
            ruleId: parsed.detectionHit.ruleId,
            ruleName: parsed.detectionHit.ruleName,
            firedAt: parsed.detectionHit.firedAt,
            count: 1,
          },
        },
      );
      await linkDetectionHitToRule(dh.id, parsed.detectionHit.ruleId);
      out.push(dh);
      if (parsed.logFinding) {
        const lf = await createArtifactNode(
          ctx.activeOrgId,
          args.caseId,
          buildBase(
            { observedAt: parsed.logFinding.timestamp, severity: parsed.detectionHit.severity, confidence: 'MEDIUM' },
            'LOG_FINDING',
            ctx.user.id,
          ),
          {
            typeLabel: TYPE_TO_LABEL.LOG_FINDING,
            typeFields: {
              logSource: parsed.logFinding.logSource,
              eventId: null,
              timestamp: parsed.logFinding.timestamp,
              rawLine: parsed.logFinding.rawLine,
              observation: parsed.logFinding.observation,
            },
          },
        );
        out.push(lf);
      }
      return out;
    },
  },
};
