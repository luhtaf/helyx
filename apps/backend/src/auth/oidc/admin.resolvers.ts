import { z } from 'zod';
import type { RequestContext } from '../context.js';
import { assertOrgRole } from '../middleware.js';
import { badInput } from '../errors.js';
import { logAudit } from '../../audits/log.js';
import {
  getOidcAdmin,
  upsertOidcConfig,
  setOidcEnabled,
  type OidcAdminView,
} from './config-repo.js';
import { invalidateDiscovery } from './discovery.js';

// OIDC SSO is instance-global, but there's no instance-superadmin role —
// gate on OWNER of the caller's active org (same bar as /admin/cti-keys).
// Secret is write-only: input may carry it, the type never returns it.

const ConfigInput = z.object({
  issuer: z.string().url().max(512),
  clientId: z.string().trim().min(1).max(256),
  clientSecret: z.string().max(512).optional().nullable(),
  redirectUri: z.string().url().max(512),
  postLoginRedirect: z.string().url().max(512),
  scopes: z.string().trim().min(1).max(256),
});

export const oidcAdminResolvers = {
  Query: {
    async oidcConfig(_p: unknown, _a: unknown, ctx: RequestContext): Promise<OidcAdminView> {
      assertOrgRole(ctx, 'OWNER');
      return getOidcAdmin();
    },
  },
  Mutation: {
    async setOidcConfig(
      _p: unknown,
      args: { input: unknown },
      ctx: RequestContext,
    ): Promise<OidcAdminView> {
      assertOrgRole(ctx, 'OWNER');
      const parsed = ConfigInput.safeParse(args.input);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw badInput(first?.message ?? 'invalid OIDC config', first?.path.join('.'));
      }
      const view = await upsertOidcConfig({
        issuer: parsed.data.issuer,
        clientId: parsed.data.clientId,
        clientSecret: parsed.data.clientSecret ?? null,
        redirectUri: parsed.data.redirectUri,
        postLoginRedirect: parsed.data.postLoginRedirect,
        scopes: parsed.data.scopes,
      });
      invalidateDiscovery(); // issuer may have changed
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        'oidc.config_update',
        { type: 'OidcConfig', id: 'singleton' },
        null,
        {
          issuer: view.issuer,
          clientId: view.clientId,
          secretRotated: Boolean(parsed.data.clientSecret),
        },
      );
      return view;
    },

    async setOidcEnabled(
      _p: unknown,
      args: { enabled: boolean },
      ctx: RequestContext,
    ): Promise<OidcAdminView> {
      assertOrgRole(ctx, 'OWNER');
      let view: OidcAdminView;
      try {
        view = await setOidcEnabled(args.enabled);
      } catch (e) {
        throw badInput((e as Error).message, 'enabled');
      }
      await logAudit(
        ctx.activeOrgId, ctx.user.id,
        args.enabled ? 'oidc.enable' : 'oidc.disable',
        { type: 'OidcConfig', id: 'singleton' },
        null,
        { enabled: view.enabled },
      );
      return view;
    },
  },
};
