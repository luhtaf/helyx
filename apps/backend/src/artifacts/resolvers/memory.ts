import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface MemoryInput {
  base: BaseInputShape;
  processName: string;
  pid?: number | null;
  finding: 'PROCESS_INJECTION' | 'HOLLOWING' | 'SHELLCODE' | 'UNBACKED_MEMORY' | 'STRINGS_MATCH' | 'OTHER';
  evidence?: string | null;
  toolUsed?: string | null;
}

export const memoryResolvers = {
  Mutation: {
    createMemoryArtifact: async (
      _p: unknown,
      args: { caseId: string; input: MemoryInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return createArtifactNode(
        ctx.activeOrgId,
        args.caseId,
        buildBase(args.input.base, 'MEMORY', ctx.user.id),
        {
          typeLabel: TYPE_TO_LABEL.MEMORY,
          typeFields: {
            processName: args.input.processName,
            pid: args.input.pid ?? null,
            finding: args.input.finding,
            evidence: args.input.evidence ?? null,
            toolUsed: args.input.toolUsed ?? null,
          },
        },
      );
    },
  },
};
