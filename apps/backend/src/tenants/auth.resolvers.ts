import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import {
  signAccessToken,
  consumeRefreshToken,
  revokeRefreshToken,
} from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { badInput, conflict, unauthenticated } from '../auth/errors.js';
import { assertAuthed } from '../auth/middleware.js';
import { createUserIfAbsent, findUserByEmail } from './users.repo.js';
import { clearCsrfToken } from '../auth/csrf.js';
import { clearSessionCookie, REFRESH_COOKIE } from '../auth/cookie.js';
import { issueUserSession } from '../auth/session.js';
import { invalidateUser } from '../cache/auth.js';
import { GraphQLError } from 'graphql';
import { isLocked, recordFail, clearFails, lockoutKey } from '../security/lockout.js';

const RegisterInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(1).max(80),
});

const LoginInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const authResolvers = {
  Query: {
    me: (_p: unknown, _a: unknown, ctx: RequestContext) => ctx.user,
  },
  Mutation: {
    register: async (_p: unknown, raw: unknown) => {
      const args = parseOrThrow(RegisterInput, raw);
      const passwordHash = await hashPassword(args.password);
      const { user, created } = await createUserIfAbsent({
        email: args.email,
        passwordHash,
        displayName: args.displayName,
      });
      if (!created) throw conflict('Email already registered');
      const token = await signAccessToken(user.id);
      return { token, user };
    },

    login: async (_p: unknown, raw: unknown, ctx: RequestContext) => {
      const args = parseOrThrow(LoginInput, raw);

      const ip = ctx.req.ip ?? 'unknown';
      const lKey = lockoutKey(args.email, ip);

      if (await isLocked(lKey)) {
        throw new GraphQLError('Account temporarily locked. Try again in 15 minutes.', {
          extensions: { code: 'ACCOUNT_LOCKED' },
        });
      }

      const record = await findUserByEmail(args.email);
      if (!record) {
        await recordFail(lKey);
        throw unauthenticated('Invalid credentials.');
      }

      const ok = await verifyPassword(args.password, record.passwordHash);
      if (!ok) {
        const status = await recordFail(lKey);
        throw new GraphQLError(
          status.locked
            ? 'Account temporarily locked. Try again in 15 minutes.'
            : 'Invalid credentials.',
          { extensions: { code: status.locked ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS' } },
        );
      }

      await clearFails(lKey);
      const { token } = await issueUserSession(ctx.res, record.id);
      return {
        token,
        user: { id: record.id, email: record.email, displayName: record.displayName },
      };
    },

    logout: async (_p: unknown, _a: unknown, ctx: RequestContext) => {
      if (ctx.user) {
        await clearCsrfToken(ctx.user.id);
        await invalidateUser(ctx.user.id);
      }
      const refreshJti = (ctx.req as { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
      if (refreshJti) await revokeRefreshToken(refreshJti);
      clearSessionCookie(ctx.res);
      return { ok: true };
    },

    refresh: async (_p: unknown, _a: unknown, ctx: RequestContext) => {
      const oldJti = (ctx.req as { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
      if (!oldJti) {
        throw new GraphQLError('no refresh token', { extensions: { code: 'NO_REFRESH' } });
      }
      const consumed = await consumeRefreshToken(oldJti);
      if (!consumed) {
        throw new GraphQLError('refresh expired or invalid', {
          extensions: { code: 'REFRESH_EXPIRED' },
        });
      }
      await issueUserSession(ctx.res, consumed.userId);
      return { ok: true };
    },
  },
};

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  throw badInput(first?.message ?? 'Invalid input', first?.path.join('.'));
}

export { assertAuthed };
