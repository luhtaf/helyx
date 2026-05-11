import { z } from 'zod';
import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { addIndicatorForActorTtp, deleteCtiIoc, listIndicatorsForActorTtp, type CtiIocRow } from './repo.js';
import { IOC_TYPES, type IocType } from '../kinds.js';

const TCODE = /^T\d{4}(\.\d{3})?$/;

const AddCtiIocSchema = z.object({
  iocType: z.enum(IOC_TYPES),
  value: z.string().trim().min(1).max(2048),
  notes: z.string().max(2000).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  actorId: z.string().min(1),
  techniqueId: z.string().regex(TCODE, 'Expected T-code like T1486 or T1059.001'),
});

export const ctiIocsResolvers = {
  Query: {
    indicatorsForActorTtp: async (
      _p: unknown,
      args: { actorId: string; techniqueId: string },
      ctx: RequestContext,
    ): Promise<CtiIocRow[]> => {
      assertOrgRole(ctx, 'VIEWER');
      if (!TCODE.test(args.techniqueId)) return [];
      return listIndicatorsForActorTtp(ctx.activeOrgId, args.actorId, args.techniqueId);
    },
  },

  Mutation: {
    addCtiIoc: async (
      _p: unknown,
      args: { input: { iocType: IocType; value: string; notes?: string | null; source?: string | null; actorId: string; techniqueId: string } },
      ctx: RequestContext,
    ): Promise<CtiIocRow> => {
      assertOrgRole(ctx, 'ANALYST');
      const input = AddCtiIocSchema.parse(args.input);
      return addIndicatorForActorTtp(ctx.activeOrgId, ctx.user.id, input);
    },

    deleteCtiIoc: async (
      _p: unknown,
      args: { id: string },
      ctx: RequestContext,
    ): Promise<boolean> => {
      assertOrgRole(ctx, 'ANALYST');
      return deleteCtiIoc(ctx.activeOrgId, args.id);
    },
  },
};
