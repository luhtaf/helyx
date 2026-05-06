import type { RequestContext } from '../auth/context.js';
import { assertOrgRole } from '../auth/middleware.js';
import { findStakeholder } from '../stakeholders/repo.js';
import {
  archiveCase,
  artifactCountsForCase,
  closeCase,
  createCase,
  findCase,
  findCaseByReportNo,
  listCases,
  totalArtifactCount,
  updateCase,
} from './repo.js';
import type { CaseRow, CaseInput, CaseUpdateInput } from './types.js';
import { listFindings, listTimeline, listArtifactsByCase } from '../artifacts/repo.js';
import { logAudit } from '../audits/log.js';

interface CasesArgs {
  stakeholderId?: string;
  status?: string[];
  search?: string;
  first?: number;
  offset?: number;
}

interface ArtifactsArgs {
  type?: string;
  severity?: string;
  limit: number;
  offset: number;
}

export const caseResolvers = {
  Query: {
    cases: (_p: unknown, args: CasesArgs, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return listCases(ctx.activeOrgId, args);
    },

    case: (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findCase(ctx.activeOrgId, args.id);
    },

    caseByReportNo: (_p: unknown, args: { reportNo: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'VIEWER');
      return findCaseByReportNo(ctx.activeOrgId, args.reportNo);
    },
  },

  Mutation: {
    createCase: (_p: unknown, args: { input: CaseInput }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ANALYST');
      return createCase(ctx.activeOrgId, args.input);
    },

    updateCase: (
      _p: unknown,
      args: { id: string; input: CaseUpdateInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return updateCase(ctx.activeOrgId, args.id, args.input);
    },

    closeCase: (
      _p: unknown,
      args: { id: string; verdict: 'CONFIRMED' | 'INCONCLUSIVE' | 'CLEAN' },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      return closeCase(ctx.activeOrgId, args.id, args.verdict);
    },

    archiveCase: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
      assertOrgRole(ctx, 'ADMIN');
      const before = await findCase(ctx.activeOrgId, args.id);
      const after = await archiveCase(ctx.activeOrgId, args.id);
      await logAudit(
        ctx.activeOrgId,
        ctx.user.id,
        'case.archive',
        { type: 'Case', id: args.id },
        before ? { status: before.status } : null,
        { status: after.status },
      );
      return after;
    },
  },

  Case: {
    stakeholder: (parent: CaseRow, _a: unknown, ctx: RequestContext) =>
      findStakeholder(ctx.activeOrgId!, parent.stakeholderId),

    artifactCount: (parent: CaseRow, _a: unknown, ctx: RequestContext) =>
      totalArtifactCount(parent.id, ctx.activeOrgId!),

    artifactsByType: (parent: CaseRow, _a: unknown, ctx: RequestContext) =>
      artifactCountsForCase(parent.id, ctx.activeOrgId!),

    findings: (parent: CaseRow, args: { limit: number }, ctx: RequestContext) =>
      listFindings(ctx.activeOrgId!, parent.id, args.limit),

    timeline: (parent: CaseRow, args: { limit: number }, ctx: RequestContext) =>
      listTimeline(ctx.activeOrgId!, parent.id, args.limit),

    artifacts: (parent: CaseRow, args: ArtifactsArgs, ctx: RequestContext) =>
      listArtifactsByCase(ctx.activeOrgId!, parent.id, args),

    lead: (_parent: CaseRow) => null,
  },
};
