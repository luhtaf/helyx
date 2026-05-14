import { GraphQLError } from 'graphql';
import { assertOrgRole } from '../../auth/middleware.js';
import type { RequestContext } from '../../auth/context.js';
import { logAudit } from '../../audits/log.js';
import {
  listPushTargets, createPushTarget, setPushTargetStatus, getPushTarget,
  listPushAttempts,
  type CreatePushTargetInput,
} from './repo.js';
import { pushHuntToTarget, type PushResult } from './push.js';
import {
  PUSH_TARGET_KINDS, type CtiPushTarget, type CtiPushAttempt, type PushTargetKind,
} from './types.js';
import { RELEASE_TIERS, type ReleaseTier } from '../kinds.js';

interface CtiPushTargetGql extends Omit<CtiPushTarget, 'apiKey' | 'maxTier'> {
  apiKeyMasked: string;
  maxTier: string;
}

function maskApiKey(k: string): string {
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

function toGql(t: CtiPushTarget): CtiPushTargetGql {
  // Storage uses dashed form ('cross-agency'); GraphQL enum is
  // underscored ('cross_agency'). Encode at the boundary.
  const tierEnum = t.maxTier.replace(/-/g, '_');
  return {
    ...t,
    maxTier: tierEnum,
    apiKeyMasked: maskApiKey(t.apiKey),
  };
}

function decodeTier(t: string): string {
  // GraphQL ReleaseTier underscored → storage dashed.
  const decoded = t.replace(/_/g, '-');
  if (!(RELEASE_TIERS as readonly string[]).includes(decoded)) {
    throw new GraphQLError(`Invalid release tier: ${t}`, {
      extensions: { code: 'BAD_INPUT', field: 'maxTier' },
    });
  }
  return decoded;
}

export const ctiPushResolvers = {
  Query: {
    async ctiPushTargets(
      _p: unknown, _a: unknown, ctx: RequestContext,
    ): Promise<CtiPushTargetGql[]> {
      assertOrgRole(ctx, 'ANALYST');
      const rows = await listPushTargets(ctx.activeOrgId);
      return rows.map(toGql);
    },

    async ctiPushAttempts(
      _p: unknown, args: { limit?: number }, ctx: RequestContext,
    ): Promise<CtiPushAttempt[]> {
      assertOrgRole(ctx, 'ANALYST');
      const limit = !args.limit || !Number.isInteger(args.limit) || args.limit <= 0
        ? 50
        : Math.min(args.limit, 100);
      return listPushAttempts(ctx.activeOrgId, limit);
    },
  },

  Mutation: {
    async addCtiPushTarget(
      _p: unknown,
      args: { input: { kind: string; label: string; url: string; maxTier: string; apiKey: string; dryRun: boolean } },
      ctx: RequestContext,
    ): Promise<CtiPushTargetGql> {
      assertOrgRole(ctx, 'OWNER');
      const { kind, label, url, maxTier, apiKey, dryRun } = args.input;
      if (!(PUSH_TARGET_KINDS as readonly string[]).includes(kind)) {
        throw new GraphQLError(`Invalid kind: ${kind}`, {
          extensions: { code: 'BAD_INPUT', field: 'kind' },
        });
      }
      const labelTrim = label.trim();
      const urlTrim = url.trim();
      if (labelTrim.length === 0 || urlTrim.length === 0) {
        throw new GraphQLError('label and url are required', {
          extensions: { code: 'BAD_INPUT' },
        });
      }
      // Validate URL parseable.
      try { new URL(urlTrim); } catch {
        throw new GraphQLError(`Invalid URL: ${urlTrim}`, {
          extensions: { code: 'BAD_INPUT', field: 'url' },
        });
      }
      const maxTierStorage = decodeTier(maxTier);
      const input: CreatePushTargetInput = {
        kind: kind as PushTargetKind,
        label: labelTrim,
        url: urlTrim,
        maxTier: maxTierStorage,
        apiKey: apiKey ?? '',
        dryRun,
      };
      const created = await createPushTarget(ctx.activeOrgId, ctx.user.id, input);
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'cti_push_target.add',
        { type: 'CtiPushTarget', id: created.id },
        null,
        { kind: created.kind, label: created.label, url: created.url, maxTier: created.maxTier, dryRun: created.dryRun },
      );
      return toGql(created);
    },

    async disableCtiPushTarget(
      _p: unknown, args: { id: string }, ctx: RequestContext,
    ): Promise<CtiPushTargetGql> {
      assertOrgRole(ctx, 'OWNER');
      const before = await getPushTarget(ctx.activeOrgId, args.id);
      if (!before) {
        throw new GraphQLError('push target not found', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      const updated = await setPushTargetStatus(ctx.activeOrgId, args.id, 'disabled');
      if (!updated) throw new GraphQLError('vanished after read', { extensions: { code: 'NOT_FOUND' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'cti_push_target.disable',
        { type: 'CtiPushTarget', id: args.id },
        { status: before.status }, { status: 'disabled', label: before.label },
      );
      return toGql(updated);
    },

    async enableCtiPushTarget(
      _p: unknown, args: { id: string }, ctx: RequestContext,
    ): Promise<CtiPushTargetGql> {
      assertOrgRole(ctx, 'OWNER');
      const before = await getPushTarget(ctx.activeOrgId, args.id);
      if (!before) {
        throw new GraphQLError('push target not found', {
          extensions: { code: 'NOT_FOUND', id: args.id },
        });
      }
      const updated = await setPushTargetStatus(ctx.activeOrgId, args.id, 'active');
      if (!updated) throw new GraphQLError('vanished after read', { extensions: { code: 'NOT_FOUND' } });
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'cti_push_target.enable',
        { type: 'CtiPushTarget', id: args.id },
        { status: before.status }, { status: 'active', label: before.label },
      );
      return toGql(updated);
    },

    async pushHuntToTarget(
      _p: unknown, args: { huntId: string; targetId: string }, ctx: RequestContext,
    ): Promise<PushResult> {
      assertOrgRole(ctx, 'OWNER');
      return pushHuntToTarget(ctx.activeOrgId, ctx.user.id, args.huntId, args.targetId);
    },
  },
};
