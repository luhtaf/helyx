import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { parse, type OperationDefinitionNode } from 'graphql';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { config } from './config.js';
import { logger } from './logger.js';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { buildContext, type RequestContext } from './context.js';
import { closeDriver } from './db/neo4j.js';
import { validationRules } from './security/depth.js';
import { apiLimiter } from './security/rate-limit.js';
import { readSessionCookie, readCsrfCookie } from './auth/cookie.js';
import { loadCsrfToken, safeEqual } from './auth/csrf.js';
import { verifyAccessToken } from './auth/jwt.js';
import { startScheduler } from './scheduler/index.js';
import { scannerIngestHandler } from './scanners/ingest.js';

// ---------------------------------------------------------------------------
// CSRF guard — AST-based mutation detection
// ---------------------------------------------------------------------------

const CSRF_EXEMPT_OPS = new Set(['login', 'register', 'refresh']);

function detectMutation(query: string): { isMutation: boolean; rootField: string | null } {
  try {
    const doc = parse(query);
    for (const def of doc.definitions) {
      if (def.kind === 'OperationDefinition' && def.operation === 'mutation') {
        const op = def as OperationDefinitionNode;
        const root = op.selectionSet.selections[0];
        const rootField = root && root.kind === 'Field' ? root.name.value : null;
        return { isMutation: true, rootField };
      }
    }
  } catch {
    // Malformed — let Apollo reject later
  }
  return { isMutation: false, rootField: null };
}

function csrfErr(code: string, message: string): Record<string, unknown> {
  return { errors: [{ message, extensions: { code } }] };
}

async function csrfGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  if (req.method !== 'POST') { next(); return; }

  const body = (req as { body?: { query?: string } }).body ?? {};
  const query = body.query ?? '';
  const { isMutation, rootField } = detectMutation(query);
  if (!isMutation) { next(); return; }
  if (rootField && CSRF_EXEMPT_OPS.has(rootField)) { next(); return; }

  // Dual-mode: Bearer header is deprecated but still accepted with a warning
  if (req.headers.authorization?.startsWith('Bearer ')) {
    res.setHeader(
      'X-Helyx-Auth-Deprecation',
      'Bearer header is deprecated; migrate to cookie + X-CSRF-Token. Removal target: see Plan C Task 20.',
    );
    next();
    return;
  }

  const sessionJwt = readSessionCookie(req);
  if (!sessionJwt) {
    res.status(401).json(csrfErr('CSRF_NO_SESSION', 'no session cookie present (set credentials: include in client)'));
    return;
  }

  const headerToken = (req.headers['x-csrf-token'] as string | undefined) ?? null;
  const cookieToken = readCsrfCookie(req);

  if (!headerToken) {
    res.status(403).json(csrfErr('CSRF_MISSING_HEADER', 'X-CSRF-Token header missing — attach from helyx_csrf_token cookie'));
    return;
  }

  if (!cookieToken || !safeEqual(headerToken, cookieToken)) {
    res.status(403).json(csrfErr('CSRF_COOKIE_MISMATCH', 'X-CSRF-Token does not match helyx_csrf_token cookie'));
    return;
  }

  const payload = await verifyAccessToken(sessionJwt);
  if (!payload) {
    res.status(401).json(csrfErr('CSRF_NO_SESSION', 'session JWT invalid or expired — call refresh mutation'));
    return;
  }

  const stored = await loadCsrfToken(payload.sub);
  if (!stored) {
    res.status(403).json(csrfErr('CSRF_SESSION_EXPIRED', 'CSRF token expired in Redis — call refresh mutation to reissue'));
    return;
  }

  if (!safeEqual(headerToken, stored)) {
    res.status(403).json(csrfErr('CSRF_SESSION_MISMATCH', 'X-CSRF-Token does not match server record (Redis)'));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apollo = new ApolloServer<RequestContext>({
    typeDefs,
    resolvers,
    introspection: config.NODE_ENV !== 'production',
    validationRules,
  });

  await apollo.start();

  const app = express();

  app.set('trust proxy', config.TRUST_PROXY_HOPS);

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Helyx-Org', 'Authorization'],
    exposedHeaders: ['X-Helyx-Auth-Deprecation'],
  }));

  // Scanner ingest — Bearer-token auth, NOT cookie-bound. Mounted
  // before csrfGuard so the scanner agent doesn't need CSRF token.
  // The endpoint validates its own bearer token internally.
  app.post('/api/v1/scanner/ingest', scannerIngestHandler);

  // Order: cors → cookieParser → apiLimiter → csrfGuard → /graphql
  app.use('/graphql', apiLimiter);
  app.use('/graphql', csrfGuard);

  app.use('/graphql', expressMiddleware(apollo, {
    context: async ({ req, res }) => buildContext(req, res),
  }));

  const port = config.BACKEND_PORT;
  const host = config.BACKEND_HOST;

  app.listen(port, host, () => {
    logger.info({ port, host }, `helyx backend listening at http://${host}:${port}/graphql`);
    startScheduler();
  });
}

main().catch((err) => {
  logger.fatal({ err: String(err) }, 'boot failed');
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
