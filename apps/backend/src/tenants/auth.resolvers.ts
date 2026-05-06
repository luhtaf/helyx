import { z } from 'zod';
import type { RequestContext } from '../auth/context.js';
import { signAccessToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { badInput, conflict, unauthenticated } from '../auth/errors.js';
import { assertAuthed } from '../auth/middleware.js';
import { createUserIfAbsent, findUserByEmail } from './users.repo.js';
import { generateCsrfToken, storeCsrfToken, clearCsrfToken } from '../auth/csrf.js';
import { setSessionCookie, setCsrfCookie, clearSessionCookie } from '../auth/cookie.js';
import { invalidateUser } from '../cache/auth.js';

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
      const record = await findUserByEmail(args.email);
      if (!record) throw unauthenticated('Invalid credentials');
      const ok = await verifyPassword(args.password, record.passwordHash);
      if (!ok) throw unauthenticated('Invalid credentials');
      const token = await signAccessToken(record.id);
      const csrfToken = generateCsrfToken();
      await storeCsrfToken(record.id, csrfToken);
      setSessionCookie(ctx.res, token);
      setCsrfCookie(ctx.res, csrfToken);
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
      clearSessionCookie(ctx.res);
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
