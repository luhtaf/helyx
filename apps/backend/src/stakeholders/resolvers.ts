import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import {
  archiveStakeholder,
  bulkCreateStakeholders,
  countStakeholdersInSektor,
  createStakeholder,
  findSektorOfStakeholder,
  findStakeholder,
  findStakeholderBySlug,
  listSektors,
  listStakeholders,
  setStakeholderSensor,
  updateStakeholder,
} from './repo.js';
import type { SektorRow, StakeholderRow, StakeholderKind } from './types.js';
import { logAudit } from '../audits/log.js';
import { parseStakeholderCsv } from './csv-import.js';

interface StakeholderFilterArgs {
  sektorId?: string;
  status?: string;
  kind?: string;
  search?: string;
  first?: number;
}

interface CreateInput {
  slug: string;
  name: string;
  aliases?: string[];
  city?: string;
  coords?: [number, number];
  notes?: string;
  sektorId?: string;
  kind?: StakeholderKind;
}

interface UpdateInput {
  name?: string;
  aliases?: string[];
  city?: string;
  coords?: [number, number];
  notes?: string;
  sektorId?: string;
  kind?: StakeholderKind;
}

interface SensorInput {
  stack?: string | null;
  status?: string | null;
  agentCount?: number | null;
  deployedAt?: string | null;
  notes?: string | null;
}

export const stakeholderResolvers = {
  Query: {
    sektors: (_p: unknown, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listSektors();
    },

    stakeholders: (
      _p: unknown,
      args: StakeholderFilterArgs,
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'VIEWER');
      return listStakeholders(ctx.activeOrgId, args);
    },

    stakeholder: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findStakeholder(ctx.activeOrgId, args.id);
    },

    stakeholderBySlug: (_p: unknown, args: { slug: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findStakeholderBySlug(ctx.activeOrgId, args.slug);
    },
  },

  Mutation: {
    createStakeholder: (_p: unknown, args: { input: CreateInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return createStakeholder(ctx.activeOrgId, args.input);
    },

    updateStakeholder: (
      _p: unknown,
      args: { id: string; input: UpdateInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return updateStakeholder(ctx.activeOrgId, args.id, args.input);
    },

    bulkImportStakeholders: async (
      _p: unknown,
      args: { csv: string },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const sektors = await listSektors();
      const { rows, errors } = parseStakeholderCsv(args.csv, sektors);
      const { createdSlugs, skippedSlugs } = await bulkCreateStakeholders(
        ctx.activeOrgId,
        rows,
      );
      await logAudit(
        ctx.activeOrgId,
        ctx.user.id,
        'stakeholder.bulk_import',
        { type: 'Stakeholder', id: 'csv-import' },
        null,
        {
          created: createdSlugs.length,
          skipped: skippedSlugs.length,
          parseErrors: errors.length,
        },
      );
      return {
        created: createdSlugs.length,
        skipped: skippedSlugs.length,
        errors,
      };
    },

    archiveStakeholder: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const before = await findStakeholder(ctx.activeOrgId, args.id);
      const after = await archiveStakeholder(ctx.activeOrgId, args.id);
      await logAudit(
        ctx.activeOrgId,
        ctx.user.id,
        'stakeholder.archive',
        { type: 'Stakeholder', id: args.id },
        before ? { status: before.status } : null,
        { status: after.status },
      );
      return after;
    },

    setStakeholderSensor: (
      _p: unknown,
      args: { id: string; input: SensorInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return setStakeholderSensor(ctx.activeOrgId, args.id, {
        stack: args.input.stack ?? null,
        status: args.input.status ?? null,
        agentCount: args.input.agentCount ?? null,
        deployedAt: args.input.deployedAt ?? null,
        notes: args.input.notes ?? null,
      });
    },
  },

  Stakeholder: {
    sektor: (parent: StakeholderRow) => findSektorOfStakeholder(parent.id),

    sensor: (parent: StakeholderRow) => ({
      stack: parent.sensorStack,
      status: parent.sensorStatus,
      agentCount: parent.sensorAgentCount,
      deployedAt: parent.sensorDeployedAt,
      notes: parent.sensorNotes,
    }),
  },

  Sektor: {
    stakeholderCount: (parent: SektorRow, _a: unknown, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return countStakeholdersInSektor(parent.id, ctx.activeOrgId!);
    },
  },
};
