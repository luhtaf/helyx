import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface NetworkInput {
  base: BaseInputShape;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'HTTP' | 'DNS';
  srcIp: string;
  srcPort?: number | null;
  dstIp: string;
  dstPort?: number | null;
  direction?: 'INBOUND' | 'OUTBOUND' | 'LATERAL' | null;
  bytes?: number | null;
  connectionStartedAt?: string | null;
}

export const networkResolvers = {
  Mutation: {
    createNetworkArtifact: async (
      _p: unknown,
      args: { caseId: string; input: NetworkInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId!,
        args.caseId,
        buildBase(args.input.base, 'NETWORK', ctx.user!.id),
        {
          typeLabel: TYPE_TO_LABEL.NETWORK,
          typeFields: {
            protocol: args.input.protocol,
            srcIp: args.input.srcIp,
            srcPort: args.input.srcPort ?? null,
            dstIp: args.input.dstIp,
            dstPort: args.input.dstPort ?? null,
            direction: args.input.direction ?? null,
            bytes: args.input.bytes ?? null,
            connectionStartedAt: args.input.connectionStartedAt ?? null,
          },
        },
      );
      return created;
    },
  },
};
