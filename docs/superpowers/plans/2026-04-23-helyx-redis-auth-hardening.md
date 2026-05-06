<!-- /autoplan restore point: /Users/fathulikhsan/.gstack/projects/luhtaf-helyx/main-autoplan-restore-20260506-194726.md -->
# Helyx Redis Foundation + Auth Cache + Cookie/CSRF + Race Fixes + Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **AI-AGNOSTIC RESUME:** This plan is consumable by any AI agent (Claude, Kimi, GPT, etc). Required state: read this file + `/Users/fathulikhsan/Project/Vuln/CLAUDE.md` + `git log -20`. Each task is self-contained — full code inline, no "it knows" assumptions. Checkboxes track progress; if a checkbox is checked AND the corresponding `git log` shows the commit message described in the task, the task is done. Resume by finding the first unchecked task and executing it.

**Goal:** Add Redis as production cache/queue/lock infra, then layer auth cache + cookie+CSRF migration + race fixes + hardening + audit log skeleton in one cohesive PR. Replaces the original `Authorization: Bearer` localStorage flow with HttpOnly+SameSite cookie + CSRF double-submit, eliminates 2 Neo4j hits per request via Redis user/role cache, fixes 3 known races, and adds depth/cost/rate limits.

**Architecture:** Redis 7 alongside existing Neo4j 5 in docker-compose. Single ioredis client (`apps/backend/src/cache/redis.ts`), generic cache abstraction (`cache.ts`) with `wrap()` single-flight to prevent stampedes. Auth context.ts wraps user+role lookups. Cookie+CSRF replaces Bearer in dual-mode for one release (deprecation warning) then drops Bearer. Hardening uses Redis-backed rate-limit + lockout. New `audits/` folder writes :AuditEvent nodes; sensitive ops call logAudit().

**Tech Stack:** TypeScript ESM, Apollo Server 4, Neo4j 5, Redis 7, ioredis, cookie-parser, graphql-depth-limit, graphql-cost-analysis, rate-limit-redis, pino.

**Spec source:** Conversation context — Phase 3 of Helyx backend roadmap.

**Project conventions (load-bearing — see CLAUDE.md):**
- File ceiling 500-1000 lines; aim well below 250
- Tenant scope: every tenant Cypher has `WHERE n.tenantId = $tenantId`
- Repo functions take `tenantId: string` required
- Resolvers: `assertOrgRole(ctx, '<role>')` then call repo with `ctx.activeOrgId`
- No tests yet — verification = `pnpm typecheck` + Cypher console + GraphQL Playground + curl
- Production-grade from start: no in-process state, scale = add nodes

---

## Resume / Handover Guidance (read first if you're a fresh session)

If you are a fresh AI session (Claude resumed, Kimi taking over, GPT, etc):

1. **Read this in order:**
   - `/Users/fathulikhsan/Project/Vuln/CLAUDE.md` (project-wide conventions)
   - This plan file (top to bottom)
   - `git log --oneline -30` (where we are)

2. **Find current task:** scan for the first unchecked `- [ ]` checkbox.

3. **Verify previous task actually shipped:** before starting your task, `git log --oneline | head -3` and confirm the previous task's commit message matches what the plan said it would.

4. **Each task is self-contained.** Full code inline. Do not assume context from prior session conversation — only the plan file + git state + repo files matter.

5. **Backend dev server may be running:** `lsof -i :4000` or check if a process is listening. If yes, hot-reload picks up edits. If no, start with `pnpm --filter @helyx/backend dev` (foreground or background as you prefer).

6. **Redis** must be running by the time you reach Task 5+: `docker compose up -d redis` (after Task 1 lands docker-compose entry).

7. **If you find an inconsistency** (plan says X but code shows Y), trust the code, document the divergence in the commit message, and proceed.

---

## File Structure

**Migrations (new):**
- `apps/backend/src/migrations/m014_audit_schema.ts` — `:AuditEvent` constraint + tenant index

**Cache (new folder):**
- `apps/backend/src/cache/redis.ts` — ioredis singleton, lazy-init, health probe
- `apps/backend/src/cache/index.ts` — generic `get/set/del/wrap` helpers + JSON serialization
- `apps/backend/src/cache/auth.ts` — auth-specific wrappers around findUserById + getUserOrgRole + invalidation

**Cookie + CSRF (modify existing + new):**
- `apps/backend/src/auth/cookie.ts` — set/clear/read session cookie helpers
- `apps/backend/src/auth/csrf.ts` — generate + store + validate CSRF token (Redis-backed)
- `apps/backend/src/auth/context.ts` — modify to read cookie OR Bearer (dual-mode)
- `apps/backend/src/index.ts` — modify: cookie-parser middleware, CSRF middleware on /graphql mutations
- `apps/backend/src/tenants/auth.resolvers.ts` — modify login/logout to set/clear cookie + issue CSRF
- `apps/web/src/api/apollo.ts` — modify: credentials include, drop Bearer, attach X-CSRF-Token

**Race fixes (modify existing):**
- `apps/backend/src/artifacts/resolvers/bulk-ioc.ts` — wrap loop in single tx
- `apps/backend/src/reconciliation/repo.ts` — add PENDING guard
- `apps/backend/src/cases/repo.ts` — catch ConstraintValidationException

**Hardening (new + modify):**
- `apps/backend/src/security/depth.ts` — depth + cost validation rules
- `apps/backend/src/security/rate-limit.ts` — rate-limit-redis config (per-IP + per-user)
- `apps/backend/src/security/lockout.ts` — login lockout via Redis INCR
- `apps/backend/src/auth/jwt.ts` — modify: short access + long refresh, rotation
- `apps/backend/src/index.ts` — modify: wire all hardening + introspection-off-in-prod
- `apps/backend/src/logger.ts` — modify: pino redact paths

**Audit log (new folder):**
- `apps/backend/src/audits/types.ts` — AuditEvent shape
- `apps/backend/src/audits/repo.ts` — writeAudit Cypher
- `apps/backend/src/audits/log.ts` — `logAudit(ctx, action, ...)` helper
- Modify 4 sensitive resolvers to call `logAudit`

**Infra:**
- `docker-compose.yml` — add redis service
- `apps/backend/src/config.ts` — add REDIS_URL env

**Total new files:** 16 · **Modified files:** ~10 · **Estimated total LOC:** ~1800

---

## Task 0.5: Migrate Apollo from `startStandaloneServer` to Express + `expressMiddleware`

**Why FIRST:** All cookie/CSRF/CORS/rate-limit middleware (Tasks 11+, 14+, 15+) require Express. Currently `apps/backend/src/index.ts` uses `startStandaloneServer` (no middleware surface). Migration is non-negotiable for Phase 3.

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/auth/context.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install Express + ensure @apollo/server**

```bash
pnpm --filter @helyx/backend add express
pnpm --filter @helyx/backend add -D @types/express
```

- [ ] **Step 2: Replace standalone server with Express + expressMiddleware**

```typescript
// apps/backend/src/index.ts — restructure boot
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { buildContext } from './auth/context.js';
import { config } from './config.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
  });
  await apollo.start();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/graphql', expressMiddleware(apollo, {
    context: async ({ req, res }) => buildContext(req, res),
  }));

  const port = Number(config.PORT ?? 4000);
  app.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'helyx backend listening');
  });
}

main().catch((err) => {
  logger.fatal({ err: String(err) }, 'boot failed');
  process.exit(1);
});
```

- [ ] **Step 3: Update buildContext + RequestContext**

In `apps/backend/src/auth/context.ts`, change signature from `buildContext(req)` to `buildContext(req, res)`. Add `req` and `res` to `RequestContext`:

```typescript
import type { Request, Response } from 'express';

export interface RequestContext {
  user: AuthedUser | null;
  activeOrgId: string | null;
  activeOrgRole: OrgRole | null;
  loaders: AppLoaders;
  req: Request;
  res: Response;
}

export async function buildContext(req: Request, res: Response): Promise<RequestContext> {
  // ... existing token extraction + lookups, plus include req+res in return:
  return { user, activeOrgId, activeOrgRole, loaders, req, res };
}
```

- [ ] **Step 4: Typecheck + smoke**

```bash
pnpm --filter @helyx/backend typecheck
sleep 5
curl -s http://localhost:4000/graphql -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{ health { api db serverTime } }"}'
```
Expected: same response shape as before (substrate swap only — no behavior change yet).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/auth/context.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(infra): migrate Apollo to Express + expressMiddleware (req+res in ctx)"
```

---

## Task 1: Redis service in docker-compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `apps/backend/src/config.ts`
- Modify: root `package.json` (db:up alias)
- Modify: `.env.example`

- [ ] **Step 1: Add Redis service to docker-compose.yml**

Append after the existing neo4j service (preserve indentation matching neo4j):

```yaml
  redis:
    image: redis:7-alpine
    container_name: helyx-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy volatile-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
```

> **`volatile-lru` not `allkeys-lru`** — protects keys WITH TTL (all auth keys are TTL'd) from eviction. Auth tokens never silently disappear under memory pressure.

In the `volumes:` section at the bottom, add:
```yaml
  redis-data:
```

- [ ] **Step 2: Add REDIS_URL to config.ts**

```typescript
REDIS_URL: z.string().default('redis://localhost:6379'),
COOKIE_SECURE: z.coerce.boolean().default(process.env.NODE_ENV === 'production'),
CORS_ORIGIN: z.string().default('http://localhost:5173'),
TRUST_PROXY_HOPS: z.coerce.number().default(0),
```

> 4 envs added now (REDIS_URL + COOKIE_SECURE + CORS_ORIGIN + TRUST_PROXY_HOPS) — all needed by later tasks. Centralize here so `.env.example` is single source of truth.

- [ ] **Step 3: Update db:up + .env.example**

Root `package.json`: change `"db:up": "docker compose up -d neo4j"` → `"db:up": "docker compose up -d neo4j redis"`.

`.env.example`, append:
```
# Cache + auth state (Redis 7+)
REDIS_URL=redis://localhost:6379

# Cookies / CORS / proxy
COOKIE_SECURE=false                       # set true in prod (HTTPS only)
CORS_ORIGIN=http://localhost:5173         # frontend origin (exact, no wildcard)
TRUST_PROXY_HOPS=0                        # 1 if behind nginx/Cloudflare
```

- [ ] **Step 4: Bring up + verify**

```bash
pnpm db:up
until docker exec helyx-redis redis-cli PING 2>/dev/null | grep -q PONG; do sleep 1; done
echo "redis ready"
```

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @helyx/backend typecheck
git add docker-compose.yml apps/backend/src/config.ts package.json .env.example
git commit -m "feat(infra): Redis 7 (volatile-lru) + REDIS_URL/COOKIE_SECURE/CORS_ORIGIN/TRUST_PROXY_HOPS envs + db:up alias"
```

---

## Task 2: ioredis client singleton

**Files:**
- Create: `apps/backend/src/cache/redis.ts`
- Modify: `apps/backend/package.json` — add ioredis dep

- [ ] **Step 1: Install ioredis**

```bash
pnpm --filter @helyx/backend add ioredis
```

- [ ] **Step 2: Create the client**

```typescript
// apps/backend/src/cache/redis.ts
import IORedis, { type Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../logger.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  client = new IORedis(config.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    reconnectOnError(err) {
      const target = ['READONLY', 'ETIMEDOUT'];
      return target.some((t) => err.message.includes(t));
    },
  });
  client.on('error', (err) => logger.warn({ err: String(err) }, 'redis client error'));
  client.on('ready', () => logger.info('redis client ready'));
  return client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const r = getRedis();
    const out = await r.ping();
    return out === 'PONG';
  } catch (err) {
    logger.warn({ err: String(err) }, 'redis ping failed');
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = null;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```
Expected: clean.

- [ ] **Step 4: Manual smoke**

```bash
pnpm --filter @helyx/backend exec tsx -e "import { pingRedis, closeRedis } from './src/cache/redis.js'; pingRedis().then((ok) => { console.log('PING:', ok); return closeRedis(); });"
```
Expected: `PING: true` then exits.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cache/redis.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(cache): ioredis client singleton with health ping"
```

---

## Task 3: Generic cache abstraction with single-flight

**Files:**
- Create: `apps/backend/src/cache/index.ts`

- [ ] **Step 1: Write cache helpers with single-flight pattern**

```typescript
// apps/backend/src/cache/index.ts
import { getRedis } from './redis.js';
import { logger } from '../logger.js';

// In-process Promise registry to coalesce concurrent misses (single-flight).
// Prevents cache stampede: 100 simultaneous reads of same missing key
// dispatch ONE underlying loader, then all 100 receive the same Promise.
const inFlight = new Map<string, Promise<unknown>>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err: String(err), key }, 'cache get failed — returning null (degraded)');
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: String(err), key }, 'cache set failed (non-fatal)');
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await getRedis().del(...keys);
  } catch (err) {
    logger.warn({ err: String(err), keys }, 'cache del failed (non-fatal)');
  }
}

/**
 * Cache-aside with single-flight + JSON serialization.
 * If multiple concurrent calls miss simultaneously, only ONE invokes loader();
 * the rest await the same Promise. Prevents stampede.
 *
 * Note: cache failures degrade to direct loader call — never throws on cache error.
 * This means a Redis outage degrades perf but does NOT take down the app.
 */
export async function cacheWrap<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const value = await loader();
      await cacheSet(key, value, ttlSeconds);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 3: Smoke test wrap behavior**

```bash
pnpm --filter @helyx/backend exec tsx -e "
import { cacheWrap, cacheDel } from './src/cache/index.js';
import { closeRedis } from './src/cache/redis.js';
let calls = 0;
const loader = async () => { calls++; await new Promise(r => setTimeout(r, 100)); return { v: 'hello' }; };
await cacheDel('test:1');
const results = await Promise.all([
  cacheWrap('test:1', 60, loader),
  cacheWrap('test:1', 60, loader),
  cacheWrap('test:1', 60, loader),
]);
console.log('loader calls:', calls, '(expected 1)');
console.log('results match:', results.every(r => r.v === 'hello'));
await cacheDel('test:1');
await closeRedis();
"
```
Expected: `loader calls: 1` (single-flight working).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/cache/index.ts
git commit -m "feat(cache): generic get/set/del/wrap with single-flight stampede prevention"
```

---

## Task 4: Wire Redis health into /health resolver

**Files:**
- Modify: `apps/backend/src/resolvers/index.ts`
- Modify: `apps/backend/src/schema/index.ts` — add `cache` field to HealthStatus

- [ ] **Step 1: Extend HealthStatus type**

In `apps/backend/src/schema/index.ts`, find the `HealthStatus` type definition and add `cache: Boolean!` field:

```graphql
type HealthStatus {
  api: Boolean!
  db: Boolean!
  cache: Boolean!
  serverTime: String!
}
```

- [ ] **Step 2: Wire pingRedis into health resolver**

In `apps/backend/src/resolvers/index.ts`, modify `coreResolvers.Query.health`:

```typescript
import { pingRedis } from '../cache/redis.js';
// ...
const coreResolvers = {
  Query: {
    health: async () => ({
      api: true,
      db: await pingDb().catch((err) => {
        logger.warn({ err }, 'health: db ping failed');
        return false;
      }),
      cache: await pingRedis(),
      serverTime: new Date().toISOString(),
    }),
  },
};
```

- [ ] **Step 3: Typecheck + verify via curl**

```bash
pnpm --filter @helyx/backend typecheck
sleep 3  # wait for backend hot reload
curl -s -X POST http://localhost:4000/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ health { api db cache serverTime } }"}'
```
Expected: `{"data":{"health":{"api":true,"db":true,"cache":true,"serverTime":"..."}}}`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/schema/index.ts apps/backend/src/resolvers/index.ts
git commit -m "feat(health): expose Redis health in /health resolver"
```

---

## Task 5: Auth user/role cache via Redis

**Files:**
- Create: `apps/backend/src/cache/auth.ts`
- Modify: `apps/backend/src/auth/context.ts`

- [ ] **Step 1: Create auth-specific cache wrappers**

```typescript
// apps/backend/src/cache/auth.ts
import { cacheDel, cacheWrap } from './index.js';
import { findUserById } from '../tenants/users.repo.js';
import { getUserOrgRole } from '../tenants/orgs.repo.js';
import type { UserRecord } from '../tenants/types.js';

const TTL_SECONDS = 60;

const userKey = (id: string) => `auth:user:${id}`;
const roleKey = (userId: string, orgId: string) => `auth:role:${userId}:${orgId}`;

export async function getCachedUser(userId: string): Promise<UserRecord | null> {
  return cacheWrap<UserRecord | null>(userKey(userId), TTL_SECONDS, () => findUserById(userId));
}

export async function getCachedUserOrgRole(userId: string, orgId: string): Promise<string | null> {
  return cacheWrap<string | null>(roleKey(userId, orgId), TTL_SECONDS, () => getUserOrgRole(userId, orgId));
}

export async function invalidateUser(userId: string): Promise<void> {
  await cacheDel(userKey(userId));
}

export async function invalidateUserOrgRole(userId: string, orgId: string): Promise<void> {
  await cacheDel(roleKey(userId, orgId));
}

export async function invalidateUserAllRoles(userId: string, orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) return;
  await cacheDel(...orgIds.map((orgId) => roleKey(userId, orgId)));
}
```

> **Note on the type imports** — `UserRecord` may be exported as `User` or different name in `tenants/types.ts`. Read that file first and use the actual exported name. Same for `findUserById` / `getUserOrgRole` — verify exact names by grepping `tenants/users.repo.ts` and `tenants/orgs.repo.ts`.

- [ ] **Step 2: Wire cache into context.ts**

In `apps/backend/src/auth/context.ts`, replace the existing `findUserById` + `getUserOrgRole` calls with the cached versions:

```typescript
import { getCachedUser, getCachedUserOrgRole } from '../cache/auth.js';
// ...
// REPLACE: const user = await findUserById(payload.sub);
const user = await getCachedUser(payload.sub);
// ...
// REPLACE: const activeOrgRole = requestedOrg ? await getUserOrgRole(user.id, requestedOrg) : null;
const activeOrgRole = requestedOrg ? await getCachedUserOrgRole(user.id, requestedOrg) : null;
```

Keep all other logic intact (the if-null returns, requestedOrg extraction).

- [ ] **Step 3: Typecheck + verify cache hit logged**

```bash
pnpm --filter @helyx/backend typecheck
sleep 3
# trigger a request twice in quick succession
TOKEN="<your-jwt>"
ORG="<your-org-id>"
for i in 1 2; do
  curl -s -X POST http://localhost:4000/graphql \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Helyx-Org: $ORG" \
    -H 'Content-Type: application/json' \
    -d '{"query":"{ sektors { slug } }"}' > /dev/null
done
# Check Redis directly
docker exec helyx-redis redis-cli KEYS "auth:*"
```
Expected: `KEYS auth:*` returns `auth:user:<userId>` and `auth:role:<userId>:<orgId>`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/cache/auth.ts apps/backend/src/auth/context.ts
git commit -m "feat(auth): Redis cache for findUserById + getUserOrgRole (60s TTL, single-flight)"
```

---

## Task 6: Cache invalidation hooks

**Files:**
- Modify: `apps/backend/src/tenants/auth.resolvers.ts` (logout)
- Modify: `apps/backend/src/tenants/org.resolvers.ts` (org membership change)

- [ ] **Step 1: Find all mutation paths that change user or membership**

```bash
grep -rn "updateUser\|removeUserFromOrg\|addUserToOrg\|changeRole" /Users/fathulikhsan/Project/Vuln/apps/backend/src --include="*.ts" | head
```

- [ ] **Step 2: Add invalidation calls**

Wherever a user record changes, append `await invalidateUser(userId)`. Wherever an org membership/role changes, append `await invalidateUserOrgRole(userId, orgId)`.

For logout in `auth.resolvers.ts`: after the resolver does its work (or even if logout is currently a no-op), import and call `invalidateUser(ctx.user.id)`.

If your codebase doesn't yet have a logout mutation, this step is no-op for logout — add a TODO comment in `auth.resolvers.ts`:
```typescript
// TODO: when explicit logout mutation lands, call invalidateUser(ctx.user.id) here
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/tenants/
git commit -m "feat(auth): cache invalidation on user/membership mutation"
```

---

## Task 7: Race fix — bulkCreateIocArtifacts atomic

**Files:**
- Modify: `apps/backend/src/artifacts/resolvers/bulk-ioc.ts`
- Modify: `apps/backend/src/artifacts/repo.ts` — add `createArtifactNodesBulk` helper

- [ ] **Step 1: Add bulk create helper to repo.ts**

```typescript
// In apps/backend/src/artifacts/repo.ts — add after createArtifactNode:
export interface BulkCreateRequest {
  base: CreateArtifactBase;
  spec: CreateArtifactSpec;
}

export async function createArtifactNodesBulk(
  tenantId: string,
  caseId: string,
  requests: BulkCreateRequest[],
): Promise<Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }>> {
  if (requests.length === 0) return [];
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Single case-status check upfront — atomic with all artifact creates
      const caseCheck = await tx.run(
        `MATCH (c:Case {id: $caseId})
         WHERE c.tenantId = $tenantId AND c.status IN ['DRAFT', 'ACTIVE']
         RETURN c.id AS id`,
        { tenantId, caseId },
      );
      if (caseCheck.records.length === 0) {
        throw new GraphQLError('Cannot add artifact to non-active case', {
          extensions: { code: 'INVALID_CASE_STATE' },
        });
      }

      const out: Array<ArtifactBaseRow & Record<string, unknown> & { __labels: string[] }> = [];
      for (const req of requests) {
        const result = await tx.run(
          `MATCH (c:Case {id: $caseId, tenantId: $tenantId})
           CREATE (a:Artifact)
           SET a:\`${req.spec.typeLabel}\`,
               a.id = randomUUID(),
               a.tenantId = $tenantId,
               a.caseId = $caseId,
               a.type = $type,
               a.observedAt = datetime($observedAt),
               a.severity = $severity,
               a.confidence = $confidence,
               a.notes = $notes,
               a.tags = $tags,
               a.addedByUserId = $addedByUserId,
               a.addedAt = datetime(),
               a += $typeFields
           MERGE (a)-[:HAS_ARTIFACT]->(c)
           WITH a, $hostAssetId AS hostId
           FOREACH (h IN CASE WHEN hostId IS NULL THEN [] ELSE [hostId] END |
             MATCH (asset:Asset {id: h}) WHERE asset.tenantId = $tenantId
             MERGE (a)-[:ON_HOST]->(asset))
           RETURN properties(a) AS props,
                  toString(a.observedAt) AS observedAt,
                  toString(a.addedAt) AS addedAt,
                  labels(a) AS __labels`,
          {
            tenantId,
            caseId,
            type: req.base.type,
            observedAt: req.base.observedAt,
            severity: req.base.severity,
            confidence: req.base.confidence,
            notes: req.base.notes,
            tags: req.base.tags,
            addedByUserId: req.base.addedByUserId,
            hostAssetId: req.base.hostAssetId,
            typeFields: req.spec.typeFields,
          },
        );
        out.push(rowToArtifact(result.records[0]!));
      }
      return out;
    });
  } finally {
    await session.close();
  }
}
```

> Note: this duplicates some logic from `createArtifactNode` because it loops INSIDE the same tx. Acceptable duplication — atomic guarantee is the value. Future refactor: extract shared Cypher into a constant.

- [ ] **Step 2: Update bulk-ioc.ts to use the new bulk helper**

```typescript
// apps/backend/src/artifacts/resolvers/bulk-ioc.ts
import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNodesBulk, linkIocToGlobalIoc, type BulkCreateRequest } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';
import { bulkParseIocs } from '../ioc-detect.js';

export const bulkIocResolvers = {
  Mutation: {
    bulkCreateIocArtifacts: async (
      _p: unknown,
      args: { caseId: string; base: BaseInputShape; values: string[] },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const items = bulkParseIocs(args.values.join('\n'));
      if (items.length === 0) return [];

      const requests: BulkCreateRequest[] = items.map((item) => ({
        base: buildBase(args.base, 'IOC', ctx.user!.id),
        spec: {
          typeLabel: TYPE_TO_LABEL.IOC,
          typeFields: {
            iocType: item.iocType,
            value: item.value,
            direction: null,
            firstSeen: null,
            lastSeen: null,
            source: 'bulk-paste',
          },
        },
      }));

      const created = await createArtifactNodesBulk(ctx.activeOrgId!, args.caseId, requests);

      // Auto-link runs AFTER atomic create — best-effort, doesn't roll back
      await Promise.all(
        created.map((node, i) =>
          linkIocToGlobalIoc(node.id, items[i]!.value).catch(() => undefined),
        ),
      );
      return created;
    },
  },
};
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/artifacts/repo.ts apps/backend/src/artifacts/resolvers/bulk-ioc.ts
git commit -m "fix(ca): bulkCreateIocArtifacts atomic — single tx prevents partial failure"
```

---

## Task 8: Race fix — resolveRawStakeholder PENDING guard

**Files:**
- Modify: `apps/backend/src/reconciliation/repo.ts`

- [ ] **Step 1: Add PENDING guard to resolveRawStakeholder**

Find the `resolveRawStakeholder` function. The current Cypher has:
```cypher
MATCH (r:RawStakeholder {id: $rawId}) WHERE r.tenantId = $tenantId
```

Modify to add a PENDING status check:
```cypher
MATCH (r:RawStakeholder {id: $rawId})
WHERE r.tenantId = $tenantId AND r.status = 'PENDING'
```

If the MATCH returns no rows after the call, throw:
```typescript
import { GraphQLError } from 'graphql';
// after the executeWrite call:
if (!updatedRow) {
  throw new GraphQLError('Raw stakeholder is not PENDING (already resolved or rejected)', {
    extensions: { code: 'ALREADY_RESOLVED' },
  });
}
```

The exact code shape depends on the current return-shape of `resolveRawStakeholder`. Read the function first to understand how to wire the throw — probably check `result.records.length === 0` inside `executeWrite`.

- [ ] **Step 2: Same treatment for createStakeholderFromRaw flow**

`createStakeholderFromRaw` calls `resolveRawStakeholder` internally — already protected by step 1.

But also check `bulkResolveRawStakeholders` — same race. Add `WHERE r.status = 'PENDING'` to its Cypher too. Return the `count(*)` of actually-updated rows so caller knows.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/reconciliation/repo.ts
git commit -m "fix(reconciliation): PENDING guard on resolve/bulk-resolve — prevents re-resolve race"
```

---

## Task 9: Race fix — createCase typed DUPLICATE_REPORT_NO error

**Files:**
- Modify: `apps/backend/src/cases/repo.ts`

- [ ] **Step 1: Catch ConstraintValidationException in createCase**

Find `createCase` function. Wrap the `executeWrite` block in try/catch:

```typescript
import { GraphQLError } from 'graphql';
// ...
export async function createCase(tenantId: string, input: CaseInput): Promise<CaseRow> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // ... existing CREATE Cypher ...
    });
  } catch (err) {
    // Neo4j throws Neo4jError with code Neo.ClientError.Schema.ConstraintValidationFailed
    const errCode = (err as { code?: string }).code ?? '';
    if (errCode === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      throw new GraphQLError(`Case reportNo "${input.reportNo}" already exists for this tenant`, {
        extensions: { code: 'DUPLICATE_REPORT_NO' },
      });
    }
    throw err;
  } finally {
    await session.close();
  }
}
```

> If session.close() is already inside the try block, restructure so it's in `finally`. Read the current shape carefully.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/cases/repo.ts
git commit -m "fix(ca): createCase catches ConstraintValidationException → typed DUPLICATE_REPORT_NO"
```

---

## Task 10: Cookie helpers + CSRF token module

**Files:**
- Create: `apps/backend/src/auth/cookie.ts`
- Create: `apps/backend/src/auth/csrf.ts`

- [ ] **Step 1: Cookie helpers**

```typescript
// apps/backend/src/auth/cookie.ts
import type { Request, Response } from 'express';
import { config } from '../config.js';

export const SESSION_COOKIE = 'helyx_session';
export const CSRF_COOKIE = 'helyx_csrf_token';  // readable by JS — not httpOnly

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

const isProd = process.env.NODE_ENV === 'production';

interface CookieOpts {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
}

const sessionCookieOpts: CookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/',
  maxAge: SEVEN_DAYS_S * 1000,
};

const csrfCookieOpts: CookieOpts = {
  httpOnly: false,
  secure: isProd,
  sameSite: 'strict',
  path: '/',
  maxAge: SEVEN_DAYS_S * 1000,
};

export function setSessionCookie(res: Response, jwt: string): void {
  res.cookie(SESSION_COOKIE, jwt, sessionCookieOpts);
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, csrfCookieOpts);
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function readSessionCookie(req: Request): string | null {
  const c = (req as Request & { cookies?: Record<string, string> }).cookies;
  return c?.[SESSION_COOKIE] ?? null;
}

export function readCsrfCookie(req: Request): string | null {
  const c = (req as Request & { cookies?: Record<string, string> }).cookies;
  return c?.[CSRF_COOKIE] ?? null;
}
```

> `config` import included for forward use; if your config doesn't need it for cookie shape, remove the import. `isProd` derived from env directly to avoid coupling cookie logic to config schema changes.

- [ ] **Step 2: CSRF token module (Redis-backed)**

```typescript
// apps/backend/src/auth/csrf.ts
import { randomBytes } from 'node:crypto';
import { cacheDel, cacheGet, cacheSet } from '../cache/index.js';

const CSRF_TTL_S = 7 * 24 * 60 * 60;

const csrfKey = (userId: string) => `auth:csrf:${userId}`;

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export async function storeCsrfToken(userId: string, token: string): Promise<void> {
  await cacheSet(csrfKey(userId), token, CSRF_TTL_S);
}

export async function loadCsrfToken(userId: string): Promise<string | null> {
  return cacheGet<string>(csrfKey(userId));
}

export async function clearCsrfToken(userId: string): Promise<void> {
  await cacheDel(csrfKey(userId));
}

/** Constant-time comparison to defeat timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 3: Install cookie-parser**

```bash
pnpm --filter @helyx/backend add cookie-parser
pnpm --filter @helyx/backend add -D @types/cookie-parser
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/cookie.ts apps/backend/src/auth/csrf.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(auth): cookie helpers + Redis-backed CSRF token module"
```

---

## Task 11: Cookie + CSRF middleware in Express + dual-mode context

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/auth/context.ts`

- [ ] **Step 1: Wire cookie-parser middleware**

In `apps/backend/src/index.ts`, near where other Express middleware is registered:

```typescript
import cookieParser from 'cookie-parser';
// ...
app.use(cookieParser());
```

- [ ] **Step 2: Add CSRF validation middleware for /graphql mutations**

```typescript
// In apps/backend/src/index.ts
import { loadCsrfToken, safeEqual } from './auth/csrf.js';
import { readCsrfCookie, readSessionCookie } from './auth/cookie.js';
import { verifyAccessToken } from './auth/jwt.js';

/**
 * CSRF guard middleware.
 *
 * Mutation detection: parse the GraphQL document and inspect
 * OperationDefinitionNode.operation === 'mutation'. String matching is brittle
 * (anonymous ops, leading whitespace, multi-op docs all break it).
 *
 * Error codes via extensions.code so frontend can branch:
 *   CSRF_NO_SESSION       — no session cookie, dev forgot credentials:include
 *   CSRF_MISSING_HEADER   — header link not attached on frontend
 *   CSRF_COOKIE_MISMATCH  — cookie value differs from header (tampering)
 *   CSRF_SESSION_MISMATCH — Redis token differs (Redis evicted or compromised)
 *   CSRF_SESSION_EXPIRED  — Redis token gone (TTL fired); call refresh
 */
import { parse, type OperationDefinitionNode } from 'graphql';

const CSRF_EXEMPT_OPS = new Set(['login', 'register', 'refresh']);

function detectMutation(query: string): { isMutation: boolean; rootField: string | null } {
  try {
    const doc = parse(query);
    for (const def of doc.definitions) {
      if (def.kind === 'OperationDefinition' && (def as OperationDefinitionNode).operation === 'mutation') {
        const op = def as OperationDefinitionNode;
        const root = op.selectionSet.selections[0];
        const rootField = root && root.kind === 'Field' ? root.name.value : null;
        return { isMutation: true, rootField };
      }
    }
  } catch {
    // Malformed query — let Apollo reject it later, don't block here
    return { isMutation: false, rootField: null };
  }
  return { isMutation: false, rootField: null };
}

function csrfErr(code: string, message: string): Record<string, unknown> {
  return { errors: [{ message, extensions: { code } }] };
}

async function csrfGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<void> {
  if (req.method !== 'POST') { next(); return; }

  const body = (req as { body?: { query?: string } }).body ?? {};
  const query = body.query ?? '';
  const { isMutation, rootField } = detectMutation(query);

  // Queries are safe by SOP — skip CSRF
  if (!isMutation) { next(); return; }

  // Pre-auth mutations (login/register/refresh) don't have a session yet
  if (rootField && CSRF_EXEMPT_OPS.has(rootField)) { next(); return; }

  // Bearer header = legacy dual-mode (deprecated, but exempt while transitioning)
  if (req.headers.authorization?.startsWith('Bearer ')) {
    res.setHeader('X-Helyx-Auth-Deprecation', 'Bearer header is deprecated; migrate to cookie + X-CSRF-Token. Removal target: see Task 20.');
    next();
    return;
  }

  // Cookie-mode: enforce CSRF
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

  // Verify cookie token matches Redis-stored one (defense vs cookie tampering)
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

// Register order matters: bodyParser → cookieParser → cors → csrfGuard → /graphql
import cors from 'cors';
import { config } from './config.js';

app.set('trust proxy', config.TRUST_PROXY_HOPS);  // 1+ behind nginx/Cloudflare
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,                            // required for cookie auth
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Helyx-Org', 'Authorization'],
  exposedHeaders: ['X-Helyx-Auth-Deprecation'],
}));
app.use('/graphql', csrfGuard);
// ... then your expressMiddleware mount from Task 0.5
```

> **Why CORS here?** Browser won't send cookies cross-origin without `Access-Control-Allow-Credentials: true` AND exact origin (no `*`). Frontend at `http://localhost:5173`, backend at `http://localhost:4000` = cross-origin in dev. Same in prod when `app.helyx.io` ↔ `api.helyx.io`.

- [ ] **Step 3: Add cors package**

```bash
pnpm --filter @helyx/backend add cors
pnpm --filter @helyx/backend add -D @types/cors
```

- [ ] **Step 4: Modify context.ts extractToken (cookie OR Bearer)**

```typescript
// In apps/backend/src/auth/context.ts buildContext():
import { readSessionCookie } from './cookie.js';

function extractToken(req: import('express').Request): string | null {
  const cookieToken = readSessionCookie(req);
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return null;
}
```

> `ctx.req` and `ctx.res` already in `RequestContext` from Task 0.5. No additional type changes needed here.

- [ ] **Step 5: Typecheck + verify**

```bash
pnpm --filter @helyx/backend typecheck
sleep 3
# Bearer path still works (legacy)
TOKEN="<jwt>"
curl -s -X POST http://localhost:4000/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { archiveStakeholder(id: \"x\") { id } }"}' \
  -i | head -10  # should NOT 403 due to deprecation header skip
```

Expected: response carries `X-Helyx-Auth-Deprecation` header.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/auth/context.ts
git commit -m "feat(auth): cookie-parser + CSRF middleware + dual-mode context (cookie OR Bearer with deprecation)"
```

---

## Task 12: Login/logout sets/clears cookie + issues CSRF

**Files:**
- Modify: `apps/backend/src/tenants/auth.resolvers.ts`

- [ ] **Step 1: On successful login, set cookies + store CSRF**

Find the login resolver. After it generates the JWT (`AuthPayload`), also:

```typescript
import { generateCsrfToken, storeCsrfToken } from '../auth/csrf.js';
import { setSessionCookie, setCsrfCookie } from '../auth/cookie.js';

// After login success and JWT is created:
const csrfToken = generateCsrfToken();
await storeCsrfToken(user.id, csrfToken);
setSessionCookie(ctx.res, jwt);
setCsrfCookie(ctx.res, csrfToken);
```

> `ctx.res` available from Task 0.5 (RequestContext extended). No type changes needed here.

- [ ] **Step 2: Add logout mutation if not exists**

In `apps/backend/src/tenants/auth.resolvers.ts` Mutation block:

```typescript
import { clearSessionCookie } from '../auth/cookie.js';
import { clearCsrfToken } from '../auth/csrf.js';
import { invalidateUser } from '../cache/auth.js';

logout: async (_p: unknown, _a: unknown, ctx: RequestContext) => {
  if (ctx.user) {
    await clearCsrfToken(ctx.user.id);
    await invalidateUser(ctx.user.id);
  }
  clearSessionCookie(ctx.res);
  return { ok: true };
},
```

If `logout` mutation doesn't exist in schema, add to `tenants/schema.ts`:
```graphql
type LogoutResult { ok: Boolean! }
extend type Mutation { logout: LogoutResult! }
```

- [ ] **Step 3: Typecheck + manual login verify**

```bash
pnpm --filter @helyx/backend typecheck
# (manual via your normal frontend or curl --cookie-jar)
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/tenants/auth.resolvers.ts apps/backend/src/tenants/schema.ts apps/backend/src/auth/context.ts
git commit -m "feat(auth): login sets HttpOnly cookie + CSRF; logout clears + invalidates"
```

---

## Task 13: Frontend Apollo client cookie + CSRF

**Files:**
- Modify: `apps/web/src/api/apollo.ts`
- Modify: `apps/web/src/stores/auth.ts` — drop token storage, rely on cookie

- [ ] **Step 1: Modify apollo.ts (HTTP link + CSRF header link)**

```typescript
// apps/web/src/api/apollo.ts
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import type { useAuthStore } from '@/stores/auth';

type AuthStore = ReturnType<typeof useAuthStore>;

function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)helyx_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function createApolloClient(auth: AuthStore): ApolloClient<unknown> {
  const httpLink = new HttpLink({
    uri: '/graphql',
    credentials: 'include',  // send cookies
  });

  const headerLink = setContext((_, { headers }) => {
    const csrf = readCsrfCookie();
    return {
      headers: {
        ...headers,
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(auth.activeOrgId ? { 'x-helyx-org': auth.activeOrgId } : {}),
      },
    };
  });

  return new ApolloClient({
    link: headerLink.concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
      query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
    },
  });
}
```

> **Note:** the previous `auth.token` field is gone from headers. The `auth` store may still hold a token for legacy compatibility — leave it for now, but the SERVER will read from cookie. Token in auth store is dead code after this commit.

- [ ] **Step 2: Drop localStorage token + one-time cleanup migration**

In `apps/web/src/stores/auth.ts`:
- Remove all `localStorage.setItem('token', ...)` / `sessionStorage` writes for token
- In the store's logout action, add `localStorage.removeItem('token')` + `localStorage.removeItem('helyx_token')` (anything that may have stored auth)
- Add comment: `// Token in HttpOnly cookie. Store tracks user/org only.`

In `apps/web/src/main.ts` (or app boot file), add a one-time cleanup before mount:
```typescript
// Migrate from old localStorage Bearer auth to cookie auth.
// Safe to run every boot — clears stale token only if no cookie present.
if (localStorage.getItem('token') && !document.cookie.includes('helyx_session')) {
  localStorage.removeItem('token');
  localStorage.removeItem('helyx_token');
}
```

- [ ] **Step 3: Verify in browser**

```bash
# Backend running, frontend running (pnpm --filter @helyx/web dev)
# Login → Application > Cookies should show helyx_session (HttpOnly) + helyx_csrf_token (JS-readable)
# Application > Local Storage should NOT contain 'token'
# Subsequent mutation requests must carry X-CSRF-Token header
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/apollo.ts apps/web/src/stores/auth.ts apps/web/src/main.ts
git commit -m "feat(web): Apollo credentials include + X-CSRF-Token header; drop+migrate localStorage Bearer"
```

---

## Task 13b: Frontend Apollo errorLink — silent refresh + REFRESH_EXPIRED routing

**Why:** Backend issues 15-min access tokens (Task 16). Without auto-refresh, users see 401 every 15 min and get logged out mid-work. Apollo errorLink intercepts 401, calls `mutation { refresh }`, retries failed query.

**Files:**
- Modify: `apps/web/src/api/apollo.ts`
- Modify: `apps/web/src/router/index.ts` — handle REFRESH_EXPIRED routing
- Modify: `apps/web/package.json` — add @apollo/client/link/error if not present

- [ ] **Step 1: Add errorLink with refresh-then-retry**

Update `apps/web/src/api/apollo.ts`:

```typescript
import { ApolloClient, HttpLink, InMemoryCache, fromPromise } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import gql from 'graphql-tag';
import type { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';

const REFRESH = gql`mutation { refresh { ok } }`;

let refreshing: Promise<boolean> | null = null;  // single-flight: 1 refresh per burst

async function doRefresh(client: ApolloClient<unknown>): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await client.mutate({ mutation: REFRESH, errorPolicy: 'all' });
        return Boolean(r.data?.refresh?.ok);
      } catch {
        return false;
      } finally {
        // Reset after 1s so the next refresh attempt isn't blocked on stale promise
        setTimeout(() => { refreshing = null; }, 1000);
      }
    })();
  }
  return refreshing;
}

export function createApolloClient(auth: ReturnType<typeof useAuthStore>): ApolloClient<unknown> {
  const httpLink = new HttpLink({ uri: '/graphql', credentials: 'include' });

  const headerLink = setContext((_, { headers }) => {
    const csrf = readCsrfCookie();
    return {
      headers: {
        ...headers,
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(auth.activeOrgId ? { 'x-helyx-org': auth.activeOrgId } : {}),
      },
    };
  });

  const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
    // Skip refresh attempt for the refresh mutation itself (avoid infinite loop)
    if (operation.operationName === 'refresh' || operation.operationName === 'login') {
      return undefined;
    }

    const code = graphQLErrors?.[0]?.extensions?.code as string | undefined;
    const status = (networkError as { statusCode?: number })?.statusCode;

    // Access expired or invalid session → try silent refresh
    if (status === 401 || code === 'CSRF_NO_SESSION') {
      return fromPromise(doRefresh(client)).flatMap((ok) => {
        if (!ok) {
          // Refresh failed too — go to login
          window.location.href = '/login';
          return forward(operation);
        }
        return forward(operation);  // retry original
      });
    }

    // Refresh itself returned REFRESH_EXPIRED → user must re-login
    if (code === 'REFRESH_EXPIRED' || code === 'INVALID_REFRESH' || code === 'NO_REFRESH') {
      auth.logout();  // local state cleanup
      window.location.href = '/login?reason=session_expired';
    }

    return undefined;
  });

  // client constructed below uses errorLink first so it sees responses, then header, then http
  const client: ApolloClient<unknown> = new ApolloClient({
    link: errorLink.concat(headerLink).concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
      query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
    },
  });

  return client;
}
```

> **Single-flight:** the `refreshing` Promise variable coalesces multiple concurrent 401s (e.g., 5 queries fire simultaneously, all expire at the same 15-min mark) into ONE refresh call. All 5 await the same Promise.

- [ ] **Step 2: Router handles `?reason=session_expired` toast**

In `apps/web/src/router/index.ts`, in `router.beforeEach`, when navigating to `/login?reason=session_expired`, show a toast or banner: "Your session expired. Please log in again."

If you don't have a toast system yet, surface via the LoginView reading `route.query.reason` and rendering a banner.

- [ ] **Step 3: Verify in browser**

Manual test:
1. Login
2. Open DevTools > Application > Cookies, find `helyx_session`, manually delete it
3. Trigger a mutation (e.g., archive case)
4. Network tab should show: original mutation 401 → `refresh` mutation 200 → original mutation retried, succeeds (or fails REFRESH_EXPIRED → redirect /login)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/apollo.ts apps/web/src/router/index.ts
git commit -m "feat(web): Apollo errorLink — silent refresh on 401 + REFRESH_EXPIRED routing"
```

---

## Task 14: GraphQL depth + cost + introspection-off-prod

**Files:**
- Create: `apps/backend/src/security/depth.ts`
- Modify: `apps/backend/src/index.ts` — wire validation rules

- [ ] **Step 1: Install deps**

```bash
pnpm --filter @helyx/backend add graphql-depth-limit graphql-cost-analysis
pnpm --filter @helyx/backend add -D @types/graphql-depth-limit
```

- [ ] **Step 2: Validation rules module**

```typescript
// apps/backend/src/security/depth.ts
import depthLimit from 'graphql-depth-limit';
import costAnalysis from 'graphql-cost-analysis';

export const validationRules = [
  depthLimit(8, { ignore: ['__schema', '__type'] }),
  costAnalysis({
    maximumCost: 1000,
    defaultCost: 1,
    variables: {},
    onComplete(cost: number) {
      // Optional: hook into pino logger if you want cost-per-request observability
    },
  }) as unknown as ReturnType<typeof depthLimit>,
];
```

> `graphql-cost-analysis` types may not perfectly align with depth-limit; the cast is intentional. Both are validation rules at runtime.

- [ ] **Step 3: Wire into Apollo + introspection-off-prod**

In `apps/backend/src/index.ts`, find `new ApolloServer({ ... })`:

```typescript
import { validationRules } from './security/depth.js';

new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
  validationRules,
})
```

- [ ] **Step 4: Typecheck + verify depth limit**

```bash
pnpm --filter @helyx/backend typecheck
sleep 3
# Crafted depth-9 query should fail
curl -s -X POST http://localhost:4000/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{a:case(id:\"x\"){a:case{a:case{a:case{a:case{a:case{a:case{a:case{id}}}}}}}}}"}' | head -c 200
```
Expected: validation error mentioning depth limit.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/security/depth.ts apps/backend/src/index.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(security): GraphQL depth (8) + cost (1000) limits + introspection off in prod"
```

---

## Task 15: Rate limit (per-IP + per-user) + login lockout

**Files:**
- Create: `apps/backend/src/security/rate-limit.ts`
- Create: `apps/backend/src/security/lockout.ts`
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/tenants/auth.resolvers.ts` — call lockout on login fail

- [ ] **Step 1: Install rate-limit-redis**

```bash
pnpm --filter @helyx/backend add express-rate-limit rate-limit-redis
```

- [ ] **Step 2: Rate limit module**

```typescript
// apps/backend/src/security/rate-limit.ts
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../cache/redis.js';

// Numbers tuned for analyst hunt workflows (heavy graph queries are normal)
const IP_MAX = 300;        // bumped from initial 100 — analyst sessions exceed easily
const USER_MAX = 1000;     // bumped from initial 500
const WINDOW_MS = 60 * 1000;

// JSON 429 handler — Apollo Client can parse GraphQL error shape
function jsonRateLimitHandler(req: import('express').Request, res: import('express').Response): void {
  const retryAfter = res.getHeader('Retry-After');
  res.status(429).json({
    errors: [{
      message: 'Too many requests — slow down and retry',
      extensions: {
        code: 'RATE_LIMITED',
        retryAfter: retryAfter ? Number(retryAfter) : 60,
      },
    }],
  });
}

export const ipLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args) as Promise<unknown>,
  }),
  keyGenerator: (req) => req.ip ?? 'unknown',  // req.ip respects trust proxy from Task 11
  handler: jsonRateLimitHandler,
});

export const userLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args) as Promise<unknown>,
  }),
  keyGenerator: (req) => {
    const cookie = (req as { cookies?: Record<string, string> }).cookies?.helyx_session;
    // Hash full cookie not slice — slice prefix collisions on truncation
    return cookie ? `user:${require('node:crypto').createHash('sha256').update(cookie).digest('hex').slice(0, 32)}` : (req.ip ?? 'unknown');
  },
  handler: jsonRateLimitHandler,
});
```

> **`trust proxy` already set in Task 11 boot.** `req.ip` will resolve to the real client IP (not nginx/Cloudflare) once `TRUST_PROXY_HOPS >= 1` is set in env.

- [ ] **Step 3: Login lockout module**

```typescript
// apps/backend/src/security/lockout.ts
import { getRedis } from '../cache/redis.js';

const WINDOW_S = 15 * 60;
const MAX_FAILS = 5;

const failKey = (key: string) => `auth:fail:${key}`;
const lockKey = (key: string) => `auth:lock:${key}`;

// Compose key from email + IP to defeat targeted DoS:
// Attacker knowing victim email cannot lock victim out — they'd lock their own IP.
export function lockoutKey(email: string, ip: string): string {
  return `${email.toLowerCase()}:ip:${ip}`;
}

export async function isLocked(key: string): Promise<boolean> {
  const r = getRedis();
  const v = await r.get(lockKey(key));
  return v !== null;
}

export async function recordFail(key: string): Promise<{ locked: boolean }> {
  const r = getRedis();
  const cnt = await r.incr(failKey(key));
  if (cnt === 1) await r.expire(failKey(key), WINDOW_S);
  if (cnt >= MAX_FAILS) {
    await r.set(lockKey(key), '1', 'EX', WINDOW_S);
    return { locked: true };
  }
  return { locked: false };
}

export async function clearFails(key: string): Promise<void> {
  const r = getRedis();
  await r.del(failKey(key), lockKey(key));
}
```

> **No `remaining` returned** — leaking attempt count helps attacker time their backoff. Per OWASP ASVS L2 V2.2.1, error messages must not reveal whether the email exists OR how many attempts remain. Generic "invalid credentials" until lockout, then generic "account locked" with no count.

- [ ] **Step 4: Wire rate-limit middleware**

In `apps/backend/src/index.ts`:

```typescript
import { ipLimiter, userLimiter } from './security/rate-limit.js';

// Before /graphql mount:
app.use('/graphql', ipLimiter, userLimiter);
```

- [ ] **Step 5: Wire lockout into login resolver**

In `auth.resolvers.ts` login mutation, gate via lockout key composed of email + client IP:

```typescript
import { isLocked, recordFail, clearFails, lockoutKey } from '../security/lockout.js';
import { GraphQLError } from 'graphql';

// ctx.req available from Task 0.5
const ip = ctx.req.ip ?? 'unknown';
const key = lockoutKey(input.email, ip);

if (await isLocked(key)) {
  throw new GraphQLError('Account temporarily locked. Try again in 15 minutes.', {
    extensions: { code: 'ACCOUNT_LOCKED' },
  });
}

// ... existing password check ...
if (!passwordMatches) {
  const status = await recordFail(key);
  // GENERIC message — don't leak attempt count or whether email exists
  throw new GraphQLError(
    status.locked
      ? 'Account temporarily locked. Try again in 15 minutes.'
      : 'Invalid credentials.',
    { extensions: { code: status.locked ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS' } },
  );
}

// On success, clear:
await clearFails(key);
```

> **Why generic message?** Per OWASP ASVS L2 V2.2.1: error responses must NOT reveal account existence or attempt count. Both pieces of info help attackers (count tells them when to back off; existence enables enumeration).

> **Why email+IP key?** With email-only key, an attacker knowing victim's email locks them out by failing login 5×. Email+IP means attacker locks themselves out, victim can still login from their real IP.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/security/rate-limit.ts apps/backend/src/security/lockout.ts apps/backend/src/index.ts apps/backend/src/tenants/auth.resolvers.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(security): rate-limit-redis (IP 300/min, user 1000/min, JSON 429) + lockout (email+IP key, 5 fails / 15min, generic msg per OWASP ASVS V2.2.1)"
```

---

## Task 16: Refresh token rotation + access token TTL drop + pino redact

**Files:**
- Modify: `apps/backend/src/auth/jwt.ts`
- Modify: `apps/backend/src/tenants/auth.resolvers.ts` — refresh mutation
- Modify: `apps/backend/src/logger.ts`

- [ ] **Step 1: Modify jwt.ts to issue access (15m) + refresh (7d) tokens**

Current jwt.ts probably has a single `signAccessToken(userId)` call returning a 7-day token. Restructure:

```typescript
// apps/backend/src/auth/jwt.ts — additions
import { randomBytes } from 'node:crypto';
import { cacheGet, cacheSet, cacheDel } from '../cache/index.js';
import { getRedis } from '../cache/redis.js';

const ACCESS_TTL_MIN = 15;
const REFRESH_TTL_DAYS = 7;
const REFRESH_GRACE_S = 30;  // old refresh valid for 30s after rotation

const refreshKey = (jti: string) => `auth:refresh:${jti}`;
const refreshGraceKey = (jti: string) => `auth:refresh:grace:${jti}`;

export async function issueRefreshToken(userId: string): Promise<{ jti: string; exp: number }> {
  const jti = randomBytes(24).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + REFRESH_TTL_DAYS * 86400;
  await cacheSet(refreshKey(jti), { userId, exp }, REFRESH_TTL_DAYS * 86400);
  return { jti, exp };
}

/**
 * Atomically move primary → grace, return userId.
 *
 * Without atomicity (3 separate Redis ops: GET → SET grace → DEL primary), if
 * the process dies between SET and DEL the JTI sits in BOTH slots → replay
 * vector. Lua MULTI/EXEC = single Redis op, all-or-nothing.
 *
 * Returns userId from primary if it existed (and atomically moves to grace).
 * Falls back to grace slot for concurrent refresh from a second tab.
 */
const ATOMIC_MOVE_LUA = `
  local primary = redis.call('GET', KEYS[1])
  if primary then
    redis.call('SET', KEYS[2], primary, 'EX', ARGV[1])
    redis.call('DEL', KEYS[1])
    return primary
  end
  return redis.call('GET', KEYS[2])
`;

export async function consumeRefreshToken(jti: string): Promise<{ userId: string } | null> {
  const r = getRedis();
  const raw = await r.eval(
    ATOMIC_MOVE_LUA,
    2,                              // KEYS count
    refreshKey(jti),                // KEYS[1] primary
    refreshGraceKey(jti),           // KEYS[2] grace
    String(REFRESH_GRACE_S),        // ARGV[1] grace TTL
  );
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw as string) as { userId: string; exp?: number };
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  await cacheDel(refreshKey(jti), refreshGraceKey(jti));
}

// Modify signAccessToken to use 15min TTL:
// (find existing function, change `expiresIn: '7d'` → `expiresIn: '15m'`)
```

- [ ] **Step 2: Add refresh mutation in auth.resolvers.ts**

```typescript
refresh: async (_p: unknown, _a: unknown, ctx: RequestContext) => {
  const oldJti = (ctx.req as { cookies?: Record<string, string> }).cookies?.helyx_refresh;
  if (!oldJti) throw new GraphQLError('no refresh token', { extensions: { code: 'NO_REFRESH' } });
  const consumed = await consumeRefreshToken(oldJti);
  if (!consumed) throw new GraphQLError('refresh expired or invalid', { extensions: { code: 'REFRESH_EXPIRED' } });

  const newAccess = signAccessToken({ sub: consumed.userId });
  const newRefresh = await issueRefreshToken(consumed.userId);
  const csrf = generateCsrfToken();
  await storeCsrfToken(consumed.userId, csrf);

  setSessionCookie(ctx.res, newAccess);
  setCsrfCookie(ctx.res, csrf);
  // Set refresh cookie (separate from session JWT cookie):
  ctx.res.cookie('helyx_refresh', newRefresh.jti, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/graphql',  // narrower path
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return { ok: true };
},
```

Add to schema:
```graphql
type RefreshResult { ok: Boolean! }
extend type Mutation { refresh: RefreshResult! }
```

Login resolver also issues + sets refresh cookie now (mirror the refresh resolver's cookie set).

Logout resolver: also `revokeRefreshToken` and `res.clearCookie('helyx_refresh')`.

- [ ] **Step 3: pino redact paths for sensitive headers/payloads**

In `apps/backend/src/logger.ts`:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.refreshToken',
      '*.accessToken',
      '*.jti',
    ],
    censor: '[REDACTED]',
  },
});
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/jwt.ts apps/backend/src/tenants/auth.resolvers.ts apps/backend/src/tenants/schema.ts apps/backend/src/logger.ts
git commit -m "feat(auth): refresh token rotation (15min access + 7d refresh, 30s grace) + pino redact"
```

---

## Task 17: m014 audit schema + audits/ folder

**Files:**
- Create: `apps/backend/src/migrations/m014_audit_schema.ts`
- Create: `apps/backend/src/audits/types.ts`
- Create: `apps/backend/src/audits/repo.ts`
- Create: `apps/backend/src/audits/log.ts`
- Modify: `apps/backend/src/migrations/index.ts`

- [ ] **Step 1: Migration**

```typescript
// apps/backend/src/migrations/m014_audit_schema.ts
import type { Migration } from './types.js';

export const m014_audit_schema: Migration = {
  id: '014_audit_schema',
  description: 'AuditEvent — append-only audit log for sensitive operations',
  up: [
    `CREATE CONSTRAINT audit_event_id_unique IF NOT EXISTS
     FOR (a:AuditEvent) REQUIRE a.id IS UNIQUE`,
    `CREATE INDEX audit_event_tenant_ts IF NOT EXISTS
     FOR (a:AuditEvent) ON (a.tenantId, a.ts)`,
    `CREATE INDEX audit_event_actor IF NOT EXISTS
     FOR (a:AuditEvent) ON (a.actorUserId)`,
    `CREATE INDEX audit_event_target IF NOT EXISTS
     FOR (a:AuditEvent) ON (a.targetType, a.targetId)`,
  ],
};
```

Register in `migrations/index.ts` (import + array entry).

- [ ] **Step 2: Types**

```typescript
// apps/backend/src/audits/types.ts
export interface AuditTarget {
  type: string;
  id: string;
}

export interface AuditEventRow {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ts: string;
}
```

- [ ] **Step 3: Repo**

```typescript
// apps/backend/src/audits/repo.ts
import { randomUUID } from 'node:crypto';
import { getSession } from '../db/neo4j.js';
import { logger } from '../logger.js';

export async function writeAuditEvent(input: {
  tenantId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (a:AuditEvent {
           id: randomUUID(),
           tenantId: $tenantId,
           actorUserId: $actorUserId,
           action: $action,
           targetType: $targetType,
           targetId: $targetId,
           before: $before,
           after: $after,
           ts: datetime()
         })`,
        {
          ...input,
          before: input.before ? JSON.stringify(input.before) : null,
          after: input.after ? JSON.stringify(input.after) : null,
        },
      ),
    );
  } catch (err) {
    // Audit write failure must NEVER break the user's mutation — log and continue
    logger.warn({ err: String(err), input }, 'audit write failed (degraded)');
  } finally {
    await session.close();
  }
}
```

- [ ] **Step 4: Helper (primitives only — respects repo/resolver boundary)**

```typescript
// apps/backend/src/audits/log.ts
import { writeAuditEvent } from './repo.js';

/**
 * logAudit takes PRIMITIVES, not RequestContext.
 *
 * Per CLAUDE.md repo/resolver boundary: repo functions never receive ctx.
 * audits/ is repo-shaped, so caller must pass primitives. This also lets
 * background jobs / migration scripts emit audit events (they have no ctx).
 *
 * Audit completeness note: not atomic with the audited operation. If the op
 * succeeds but audit write fails (Redis/Neo4j blip), the op is un-audited.
 * Documented degradation per ASVS L2 V10.3.4 — for higher integrity, stream
 * to dedicated append-only sink in a future phase.
 */
export async function logAudit(
  tenantId: string,
  actorUserId: string,
  action: string,
  target: { type: string; id: string },
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  await writeAuditEvent({
    tenantId,
    actorUserId,
    action,
    targetType: target.type,
    targetId: target.id,
    before,
    after,
  });
}
```

> **Action naming convention:** `<entity>.<verb>` lowercase, e.g. `case.archive`, `stakeholder.archive`, `reconciliation.resolve`, `reconciliation.bulk_resolve`. Future audit query/filter relies on this.

> **Runbook (compliance review):** to query who did what:
> ```cypher
> MATCH (a:AuditEvent {tenantId: $tenantId})
> WHERE a.actorUserId = $userId AND a.ts >= datetime() - duration({days: 30})
> RETURN a ORDER BY a.ts DESC LIMIT 100;
> ```
>
> **Retention:** AuditEvent has NO TTL — append-only. Implement retention policy before scale (e.g., `MATCH (a:AuditEvent) WHERE a.ts < datetime() - duration({years: 2}) DETACH DELETE a`). Track in CLAUDE.md.

- [ ] **Step 5: Apply migration**

```bash
pnpm --filter @helyx/backend migrate
docker exec helyx-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "SHOW CONSTRAINTS YIELD name WHERE name = 'audit_event_id_unique' RETURN name;"
```
Expected: returns the constraint name.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/migrations/m014_audit_schema.ts apps/backend/src/migrations/index.ts apps/backend/src/audits/
git commit -m "feat(audit): m014 AuditEvent schema + audits/ folder + logAudit helper"
```

---

## Task 18: Wire logAudit into 4 sensitive resolvers

**Files:**
- Modify: `apps/backend/src/reconciliation/resolvers.ts` — resolveRawStakeholder, bulkResolveRawStakeholders
- Modify: `apps/backend/src/cases/resolvers.ts` — archiveCase
- Modify: `apps/backend/src/stakeholders/resolvers.ts` — archiveStakeholder

- [ ] **Step 1: Each resolver — capture before, do op, capture after, log via primitives**

Pattern for each (note `logAudit` takes primitives extracted from ctx, NOT ctx itself):

```typescript
// Example: archiveCase
import { logAudit } from '../audits/log.js';

archiveCase: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
  assertOrgRole(ctx, 'ADMIN');
  // assertOrgRole narrows ctx — user + activeOrgId guaranteed non-null after this
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
```

Apply same pattern to:
- `resolveRawStakeholder` (action: `reconciliation.resolve`, target type: `RawStakeholder`)
- `bulkResolveRawStakeholders` (action: `reconciliation.bulk_resolve`, target type: `RawStakeholder`, target id: `'(bulk)'`, after: `{ count: returnedNumber, rawIds: args.rawIds }`)
- `archiveStakeholder` (action: `stakeholder.archive`, target type: `Stakeholder`)
- `archiveCase` (action: `case.archive`, target type: `Case`)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/reconciliation/resolvers.ts apps/backend/src/cases/resolvers.ts apps/backend/src/stakeholders/resolvers.ts
git commit -m "feat(audit): wire logAudit into 4 sensitive ops (resolve, bulk-resolve, 2 archives)"
```

---

## Task 19: CLAUDE.md updates (cache + audits + auth flow + retention)

**Why:** Without docs, future devs re-invent cache, miss audit semantics, debug auth blindly. DX subagent flagged: `cache/`, `audits/`, and the cookie+CSRF round-trip are invisible without doc updates.

**Files:**
- Modify: `/Users/fathulikhsan/Project/Vuln/CLAUDE.md`

- [ ] **Step 1: Append "Cache (Redis)" subsection**

After the existing architectural intent block in CLAUDE.md, add:

```markdown
### Cache + ephemeral state (Redis)

`apps/backend/src/cache/` is the single Redis surface. Never call ioredis directly outside this folder.

- `redis.ts` — singleton client, lazy-init, `pingRedis()` for health
- `index.ts` — `cacheGet/cacheSet/cacheDel/cacheWrap`. Use `cacheWrap(key, ttl, loader)` for cache-aside with single-flight (prevents stampede). Cache failures degrade to direct loader call — never throw on cache error.
- `auth.ts` — typed wrappers for user + role lookups. Invalidate via `invalidateUser(id)` / `invalidateUserOrgRole(userId, orgId)` on every user/membership mutation.

**Key namespace convention** (must match invalidator paths):
- `auth:user:<userId>` — user record (60s TTL)
- `auth:role:<userId>:<orgId>` — org role (60s TTL)
- `auth:csrf:<userId>` — CSRF token (7d TTL)
- `auth:refresh:<jti>` — refresh JTI primary (7d TTL)
- `auth:refresh:grace:<jti>` — refresh grace slot (30s TTL)
- `auth:fail:<email>:ip:<ip>` — login fail counter (15min TTL)
- `auth:lock:<email>:ip:<ip>` — account lockout (15min TTL)

Redis policy `volatile-lru` — only TTL'd keys are eviction-eligible. Auth keys are TTL'd, so they survive memory pressure unless their TTL expires.
```

- [ ] **Step 2: Append "Auth flow" subsection**

```markdown
### Auth flow (cookie + CSRF + refresh rotation)

**Login** (`mutation login`):
1. Server verifies password (argon2id + lockout check)
2. Server issues 15min access JWT + 7d refresh JTI
3. Server sets 3 cookies: `helyx_session` (HttpOnly access JWT), `helyx_csrf_token` (JS-readable CSRF), `helyx_refresh` (HttpOnly path=/graphql)
4. Server stores CSRF in `auth:csrf:<userId>` and refresh JTI in `auth:refresh:<jti>`

**Mutation request:**
1. Browser auto-sends all cookies (SameSite=Strict)
2. Frontend reads `helyx_csrf_token` cookie via JS, sends as `X-CSRF-Token` header
3. Backend `csrfGuard` verifies header == cookie == server-stored CSRF (defense in depth)
4. Resolver runs

**401 on access expiry:**
1. Frontend Apollo errorLink intercepts
2. Calls `mutation refresh` with `helyx_refresh` cookie
3. Server consumes refresh JTI atomically (Lua MOVE: primary→grace) and issues new access + new refresh + new CSRF
4. Frontend retries original mutation

**Bearer header (deprecated):**
- `Authorization: Bearer <jwt>` still accepted in dual-mode for one release (Task 20 removes)
- CSRF guard skips Bearer requests but sets `X-Helyx-Auth-Deprecation` response header
- Tracked via prod metrics; removed when count drops to 0 for 7 consecutive days
```

- [ ] **Step 3: Append "Audit log (compliance)" subsection**

```markdown
### Audit log (`audits/`)

`apps/backend/src/audits/` writes append-only `:AuditEvent` nodes to Neo4j. Wired to 4 sensitive ops as of Phase 3 (resolveRawStakeholder, bulkResolveRawStakeholders, archiveCase, archiveStakeholder). Standard: OWASP ASVS L2 V10.3.4.

`logAudit(tenantId, actorUserId, action, target, before, after)` takes primitives (NOT ctx) per repo/resolver boundary. Action naming: `<entity>.<verb>` lowercase.

**Completeness caveat:** audit write is NOT atomic with the audited operation. If audit fails (Redis/Neo4j blip), op succeeds un-audited. Acceptable per project policy; for higher integrity, future phase streams to dedicated append-only sink.

**Retention:** AuditEvent has NO TTL — append-only forever. Implement retention policy before scaling:
\`\`\`cypher
MATCH (a:AuditEvent) WHERE a.ts < datetime() - duration({years: 2}) DETACH DELETE a;
\`\`\`

**Compliance query (who did what in last 30d):**
\`\`\`cypher
MATCH (a:AuditEvent {tenantId: $tenantId})
WHERE a.actorUserId = $userId AND a.ts >= datetime() - duration({days: 30})
RETURN a ORDER BY a.ts DESC LIMIT 100;
\`\`\`
```

- [ ] **Step 4: Update Commands section**

In CLAUDE.md's Commands block, change:
```
pnpm db:up                     # docker compose up -d neo4j
```
to:
```
pnpm db:up                     # docker compose up -d neo4j redis
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): cache + auth flow + audit log + retention sections"
```

---

## Task 20: Bearer removal — exit criteria + commit

**Why:** Plan deprecates Bearer in dual-mode but original draft never said WHEN to remove it. Without explicit criteria, Bearer support persists forever (CSRF permanently exempted for Bearer requests).

**This task does NOT execute as part of Phase 3 commits.** It defines the criteria + the future commit. Execute only after monitoring confirms zero Bearer usage.

**Files (when triggered):**
- Modify: `apps/backend/src/auth/context.ts` — remove Bearer fallback in `extractToken`
- Modify: `apps/backend/src/index.ts` — remove `Authorization` from CORS allowedHeaders + remove Bearer skip in `csrfGuard` + drop `X-Helyx-Auth-Deprecation` setter
- Modify: `apps/web/src/api/apollo.ts` — already cookie-only after Task 13

### Exit criteria (ALL must be true)

- [ ] **A. Frontend migration verified.** No `Authorization: Bearer` header observed in `nginx`/Vite proxy access logs for **7 consecutive days** following Task 13 deploy. Run:
  ```bash
  # Adjust to your actual log path
  awk '/POST .*\/graphql/ && /Authorization: Bearer/' /var/log/nginx/access.log* | wc -l
  ```
  Expected: `0`.

- [ ] **B. Deprecation header count zero in prod metrics.** If pino logging captures `X-Helyx-Auth-Deprecation` response header counts (or you have request-tracing): grep prod logs for the deprecation header for 7 days. Count must be 0.
  ```bash
  grep -c "X-Helyx-Auth-Deprecation" /var/log/helyx/backend.log* | awk -F: '{sum+=$2} END {print sum}'
  ```
  Expected: `0`.

- [ ] **C. No internal scripts/CI use Bearer.** Audit:
  ```bash
  rg -l "Authorization.*Bearer" /Users/fathulikhsan/Project/Vuln --type-add 'config:*.{yml,yaml,json,sh,env*}' --type config --type ts
  ```
  Expected: zero matches outside the Phase 3 plan/audit doc itself.

### Removal commit (when A+B+C met)

```typescript
// apps/backend/src/auth/context.ts — extractToken simplifies to:
import { readSessionCookie } from './cookie.js';

function extractToken(req: import('express').Request): string | null {
  return readSessionCookie(req);
}
```

```typescript
// apps/backend/src/index.ts CSRF guard:
//   REMOVE: the entire `if (req.headers.authorization?.startsWith('Bearer '))` block
//   REMOVE: 'Authorization' from cors allowedHeaders
//   REMOVE: 'X-Helyx-Auth-Deprecation' from cors exposedHeaders
```

- [ ] **Verification after removal commit**

```bash
# Bearer header now rejected — should return 401 (no session cookie)
curl -s -X POST http://localhost:4000/graphql \
  -H "Authorization: Bearer xxx" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { archiveStakeholder(id: \"x\") { id } }"}' \
  -i | head -5
```
Expected: `HTTP/1.1 401` with body `{"errors":[{"message":"no session cookie present...","extensions":{"code":"CSRF_NO_SESSION"}}]}`.

- [ ] **Commit**

```bash
git commit -m "feat(auth): remove deprecated Bearer header support — cookie-only auth (exit criteria met)"
```

> **Estimated activation date:** 7-14 days after Task 13 frontend deploy. Track in TODOS.md or open a calendar reminder. Do NOT pre-emptively land this task during Phase 3 — frontend migration must be in production first.

---

## Self-Review Checklist (post-write)

**Spec coverage (post-/autoplan revision):**
- [x] Phase 0: Express migration → Task 0.5 (gating — Apollo standalone → expressMiddleware)
- [x] Phase A: Redis foundation → Tasks 1-4 (service [volatile-lru, db:up alias, .env.example] + client + cache + health)
- [x] Phase B: Auth perf cache → Tasks 5-6 (cached lookups + invalidation)
- [x] Phase C: Race fixes → Tasks 7-9 (3 races: bulkIoc, resolve, createCase)
- [x] Phase D: Cookie + CSRF → Tasks 10-13 (helpers, middleware [CORS, AST detect, error codes], login flow, frontend [+ localStorage cleanup])
- [x] Phase D-bis: Frontend silent refresh → Task 13b (Apollo errorLink + REFRESH_EXPIRED routing)
- [x] Phase E: Hardening → Tasks 14-16 (depth/cost/intro, rate-limit [JSON 429] + lockout [email+IP key, generic msg], refresh [Lua atomic move] + pino)
- [x] Phase F: Audit log → Tasks 17-18 (schema + helper [primitives signature] + runbook + 4 wire-ups)
- [x] Phase G: Documentation → Task 19 (CLAUDE.md cache + auth flow + audit + commands)
- [x] Phase H: Bearer removal → Task 20 (exit criteria + commit, runs ~7-14d post-Task 13)

**No placeholders verified.** Each step has full code (Cypher, TS, shell).

**Type/symbol consistency:**
- `getRedis()` exported from `cache/redis.ts`, used in `cache/index.ts`, `security/rate-limit.ts`, `security/lockout.ts`, `auth/jwt.ts` (Lua eval), `auth/csrf.ts` ✓
- `cacheWrap`/`cacheGet`/`cacheSet`/`cacheDel` consistent across all consumers ✓
- `RequestContext { req, res }` extension established in Task 0.5; downstream tasks reference `ctx.res` directly ✓
- `logAudit(tenantId, actorUserId, action, target, before, after)` signature consistent in Task 17 def + Task 18 wire — primitives only, no ctx ✓
- `lockoutKey(email, ip)` helper in lockout.ts; callsite in Task 15 Step 5 uses it ✓
- CSRF error codes consistent: `CSRF_NO_SESSION` / `CSRF_MISSING_HEADER` / `CSRF_COOKIE_MISMATCH` / `CSRF_SESSION_MISMATCH` / `CSRF_SESSION_EXPIRED` / `REFRESH_EXPIRED` (Task 11 backend, Task 13b frontend) ✓
- ENV vars: `REDIS_URL`, `COOKIE_SECURE`, `CORS_ORIGIN`, `TRUST_PROXY_HOPS` defined in Task 1, used in Tasks 10/11/15 ✓

**Cross-task dependencies + parallelization:**
- **T0.5 must finish first** (Express substrate gates everything Express-middleware-based)
- Tasks 1-4 sequential (Redis foundation)
- After T4 completes: T5+T6 (auth cache) AND T7+T8+T9 (race fixes — no Redis needed) AND T14 (depth/cost/intro — no Redis needed) can run **parallel**
- T10-T13 sequential (cookie/CSRF flow has internal dependencies)
- T13b requires T13 + T16 done
- T15-T16 require T2 (Redis client)
- T17-T18 mostly independent of cookie work (audit can wire any time after T2 + m014)
- T19 (docs) runs LAST in this PR
- T20 runs **post-deploy + 7-14 days** after T13 — NOT part of Phase 3 PR

**Total tasks: 20** (was 18 pre-revision; +T0.5, +T13b, +T19, +T20 from /autoplan critical findings)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-helyx-redis-auth-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration. Best because the 18 tasks span infra/security/code in a way where each task is reviewable independently.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Heavier on this session's context.

**Which approach?** And: do you want me to run `/autoplan` on this plan first (CEO scope challenge + Eng arch review + dual voice with Codex)?

---

<!-- AUTONOMOUS DECISION LOG -->
## /autoplan Review — Decision Audit Trail

### Phase 1: CEO Review (subagent-only — Codex 402 deactivated_workspace)

| # | Phase | Decision | Classification | Principle | Rationale | Rejected option |
|---|-------|----------|----------------|-----------|-----------|-----------------|
| 1 | CEO | Premise 1 (Redis worth infra cost) ACCEPTED | Mechanical | P1+P5 | Single docker container unlocks 4 use cases (cache, rate-limit, lockout, future jobs). Leverage > cost is high. | Stay LRU (already deprecated by user pushback) |
| 2 | CEO | Premise 5 (refresh rotation required) ACCEPTED | Mechanical | P1 | 7d access token = 7d compromise window. Modern best practice. | Single 7d access token |
| 3 | CEO | Audit log destination challenged | **USER CHALLENGE** | — | Subagent flags: writing audit to Neo4j hot-path = write amplification. Recommends time-series DB / object store / log aggregator. **Surfaced at gate.** | Audit to Neo4j as plan |
| 4 | CEO | Plan splitting (3 PRs vs 1) challenged | **USER CHALLENGE** | — | Subagent recommends split: Redis+cache, then cookie+CSRF, then audit. Reduces blast radius + reviewer burden. **Surfaced at gate.** | Combined PR as written |
| 5 | CEO | Lockout error message leaks attempts | Mechanical (security) | P1 | "Invalid credentials (3 attempts remaining)" tells attacker exactly when to back off. Standard practice = generic msg until lockout. **AUTO-FIX in Task 15.** | Keep current message |
| 6 | CEO | Redis allkeys-lru evicting auth keys | Mechanical | P1 | maxmemory-policy `allkeys-lru` can evict CSRF/refresh keys silently → mystery 403s. **AUTO-FIX: partition (separate noevict policy for `auth:*` namespace) OR drop maxmemory limit, OR move to Redis with `volatile-lru` (only TTL keys evicted).** Decision: switch to `volatile-lru` so persistent keys (auth:*) are protected when their TTL is set. | Keep `allkeys-lru` |
| 7 | CEO | Rate limit 100/min/IP too aggressive for analyst | Taste | P3 | Analysts run heavy graph queries during hunts. 100/min triggers on legitimate use. **AUTO-FIX: bump to 300/min/IP, 1000/min/user.** Numbers are tunable per ops feedback later. | Keep 100/500 |
| 8 | CEO | CSRF via double-submit possibly overkill | Taste | P5 | Modern SameSite=Strict on same-origin SPA defeats most CSRF. Double-submit adds 2 Redis round-trips per mutation. **DECISION: keep double-submit per defense-in-depth (P1)** — overhead is 1ms, value is real. Don't auto-fix. | Drop CSRF, rely SameSite alone |
| 9 | CEO | **15-min access token but NO frontend auto-refresh loop in plan** | **CRITICAL — MUST FIX** | P1 | Subagent caught: backend issues 15min access + 7d refresh, but Task 13 frontend doesn't wire silent refresh. Users get 401 every 15min. **AUTO-FIX: add Task 13b — Apollo errorLink intercepts 401, calls refresh mutation, retries failed query.** | Ship without auto-refresh |
| 10 | CEO | OAuth2/OIDC scope deferred (already in #23) | Mechanical | P3 | Already explicitly out of scope per plan + task #23. Confirm. | Add to this plan |
| 11 | CEO | Job queue (BullMQ) deferred | Mechanical | P3 | Redis enables it but not required for Phase 3 deliverables. Add to TODOS. | Include in this plan |

### Premise Gate Resolutions (user confirmed)

| # | Premise | User decision | Standard chosen |
|---|---------|---------------|-----------------|
| 2 | Cookie+CSRF worth migration burden? | ACCEPTED — "secure by design", defense vs unknown zero-day | OWASP ASVS L2 + ISO 27001 alignment (BSSN/TNI-ready) |
| 4 | Audit log needed now? | ACCEPTED — best practice baseline | OWASP ASVS L2 V8 (data protection / V10 (logging) |

### Phase 3: Eng Review (subagent-only, Codex 402)

| # | Phase | Decision | Classification | Principle | Rationale | Action |
|---|-------|----------|----------------|-----------|-----------|--------|
| 12 | Eng | Refresh token grace move NOT atomic | **CRITICAL — MUST FIX** | P1 | Eng subagent caught: `consumeRefreshToken` does GET → SET grace → DEL primary in 3 separate Redis ops. Process death between SET and DEL leaves replay window. | **Fix Task 16: replace with Redis Lua MULTI/EXEC script for atomic move** |
| 13 | Eng | Frontend 401 auto-refresh interceptor not in plan | **CRITICAL** | P1 | Both subagents caught (CEO #9 + Eng). 15-min access token w/o silent refresh = users see 401 every 15 min. | **Add Task 13b: Apollo errorLink intercepts 401 → calls refresh mutation → retries failed query** |
| 14 | Eng | Bearer removal exit criteria undefined | **CRITICAL** | P1 | Plan says "dual-mode 1 release then drop" but doesn't define WHICH commit removes Bearer. Risk: Bearer support persists indefinitely (CSRF permanently exempted). | **Add Task 19: explicit removal commit after frontend migration verified (no Bearer in Vite proxy logs for 7 days)** |
| 15 | Eng | `ctx.res` not in current `RequestContext` type | HIGH | P5 | Task 12 calls `setSessionCookie(ctx.res, ...)` but current type has no `res`. Will TS-error at compile. | **Make explicit step in Task 11: extend RequestContext to include req+res. Update buildContext to pass them through.** |
| 16 | Eng | CORS config missing for `credentials: 'include'` | HIGH | P1 | Cross-origin cookies need `Access-Control-Allow-Origin: <exact>` + `Allow-Credentials: true`. Currently `startStandaloneServer` has no CORS config. | **Add to Task 11: install `cors` package, configure with explicit origin allowlist (env-driven)** |
| 17 | Eng | `trust proxy` not set for rate limiter | HIGH | P1 | Behind nginx/Cloudflare, `req.ip` = proxy IP → all clients share one bucket → first 300 req lock everyone. | **Add to Task 15: `app.set('trust proxy', 1)` + document `TRUST_PROXY_HOPS` env var** |
| 18 | Eng | Login lockout DoS on targeted accounts | HIGH | P1 | Lockout key = `email:<addr>` only. Attacker knows email → fails 5x → victim locked out. | **Fix Task 15: change key to combined `email:<addr>:ip:<ip>` (or add progressive delay before hard lockout). Per OWASP ASVS L2 V2.2.1.** |
| 19 | Eng | `startStandaloneServer` → Express migration not called out | HIGH | P5 | Plan implies `app.use(...)` but current code uses Apollo standalone. Whole Express setup needs explicit task. | **Add Task 0.5: migrate to Express + `expressMiddleware` (must precede cookie/CSRF work)** |
| 20 | Eng | CSRF detection via string `startsWith('mutation')` | MEDIUM | P5 | Brittle: anonymous ops, leading whitespace, multi-op docs all break. | **Fix Task 11: use ApolloServerPlugin `requestDidStart` hook to inspect parsed `OperationDefinitionNode.operation === 'mutation'` instead** |
| 21 | Eng | `secure: isProd` cookie footgun in staging | MEDIUM | P3 | If `NODE_ENV=production` locally, secure=true requires HTTPS. Vite dev proxy is HTTP → cookie never arrives. | **Fix Task 10: add `COOKIE_SECURE` env override** |
| 22 | Eng | Audit write in separate tx — not atomic with op | MEDIUM | P5 | If op succeeds but audit fails, sensitive op un-audited. Per OWASP ASVS L2 V10.3.4 logging completeness. | **Document explicitly: "audit completeness not guaranteed — degraded if Redis/Neo4j fails mid-write." Add Task 17 note. For higher integrity: stream to separate append-only sink later (Phase ∞).** |
| 23 | Eng | Task 1 docker-compose still shows `allkeys-lru` despite Decision #6 fix | MEDIUM | P5 | Lazy commit — fix wasn't applied to actual Task 1. | **Edit Task 1 step 1: change `--maxmemory-policy allkeys-lru` to `--maxmemory-policy volatile-lru`** |
| 24 | Eng | Cross-instance cache stampede (single-flight per-process) | LOW | P3 | 4 instances × cache miss = 4 Neo4j hits. Acceptable for user lookup (cheap query). | **Document as known limitation in Task 3. Add scale gate note: "if expanding to deeper entities, add Redis SETNX distributed lock first."** |

### Phase 3.5: DX Review (subagent-only)

| # | Phase | Decision | Classification | Principle | Rationale | Action |
|---|-------|----------|----------------|-----------|-----------|--------|
| 25 | DX | `pnpm db:up` doesn't include Redis | HIGH | P5 | DX caught: setup silently degrades. New dev wastes 20 min. | **Fix Task 1: update package.json `db:up` to start neo4j+redis.** |
| 26 | DX | `.env.example` missing REDIS_URL line | HIGH | P5 | Defaults in code don't tell devs what's required. | **Fix Task 1: add REDIS_URL line to .env.example with default + comment.** |
| 27 | DX | CSRF errors return same generic `'CSRF token mismatch'` for 3 distinct failure modes | **CRITICAL** | P1 | DX caught: dev can't distinguish missing-header vs cookie-mismatch vs server-mismatch vs Redis-expired. Debugging hell. | **Fix Task 11: use `extensions.code` per failure: CSRF_MISSING_HEADER / CSRF_COOKIE_MISMATCH / CSRF_SESSION_MISMATCH / CSRF_SESSION_EXPIRED.** |
| 28 | DX | Refresh expiry not intercepted on frontend | HIGH | P1 | Apollo errorLink in Task 13 only handles 401 access expiry, not refresh expiry. Silent logout. | **Fix Task 13b (combined with CEO #9 + Eng #13): errorLink branches REFRESH_EXPIRED → /login w/ toast.** |
| 29 | DX | `logAudit(ctx, ...)` violates repo/resolver boundary per CLAUDE.md | HIGH | P5 | DX caught: CLAUDE.md prohibits passing RequestContext into repo functions. Plan's helper takes ctx directly. Background jobs can't audit. | **Fix Task 17: change signature to `logAudit(tenantId, actorUserId, action, target, before, after)`. Each callsite extracts from ctx after assertOrgRole.** |
| 30 | DX | Rate limit returns plain HTML 429 — Apollo can't parse | HIGH | P1 | Apollo errorLink expects GraphQL error JSON. 429 from express-rate-limit defaults = unhelpful network error. | **Fix Task 15: add custom `handler` returning JSON `{ errors: [{ message, extensions: { code: 'RATE_LIMITED', retryAfter } }] }`.** |
| 31 | DX | `cache/`, `audits/`, auth-flow not in CLAUDE.md | HIGH | P5 | Future devs won't discover the abstractions → re-invent. | **Add to plan: a final "Task 19: CLAUDE.md updates" — document `cache/`, `audits/`, auth flow round-trip, deprecation timeline.** |
| 32 | DX | No localStorage clear on cookie cutover | HIGH | P3 | Old `localStorage.token` persists indefinitely after migration. Confuses future debuggers. | **Fix Task 13: add `localStorage.removeItem('token')` to logout + boot-time cleanup if cookie absent.** |
| 33 | DX | Task 19 (Bearer removal exit criteria) not written into plan body | **CRITICAL** | P1 | Eng+DX both flagged. Plan has audit log entry but no actual Task 19 with code. | **Write Task 19: explicit removal criteria + commit instructions.** |
| 34 | DX | Task 1 docker-compose still has `allkeys-lru` despite Decision #6 | MEDIUM | P5 | Lazy commit. Already flagged in Eng #23. | **Edit Task 1: change to `volatile-lru`.** |
| 35 | DX | No CORS package wired for `credentials: 'include'` | HIGH | P1 | DX confirms Eng #16. Cross-origin cookies need explicit CORS. | **Fix Task 11: install `cors`, configure with env-driven origin allowlist.** |
| 36 | DX | Audit query runbook missing | MEDIUM | P5 | SRE/compliance reviewer has no Cypher template. | **Add to Task 17 doc: example Cypher to query AuditEvents by user/date.** |
| 37 | DX | AuditEvent retention not specified | MEDIUM | P3 | Append-only forever = unbounded growth. | **Add Task 17 note: retention policy decision deferred (default no TTL); add WARNING in CLAUDE.md.** |
| 38 | DX | No Redis metrics / hit rate observability | MEDIUM | P5 | `/health` returns boolean only. SRE can't monitor cache effectiveness. | **Add Task 4 doc note: SRE runbook for `redis-cli INFO stats`. Future task: emit hit/miss to pino logger.** |
| 39 | DX | `cacheWrap` key namespace convention not in JSDoc | LOW | P5 | Future devs may invent inconsistent keys → invalidation orphans. | **Add JSDoc with @example to cache/index.ts cacheWrap.** |

---

## Cross-Phase Themes

**Theme 1 — Deferred-detail risk (CRITICAL).** All 3 phases (CEO + Eng + DX) caught the same pattern: **decisions logged in audit but never applied to actual Task code**. Specifically Tasks 13b (silent refresh) and 19 (Bearer removal) are referenced in audit but absent from plan body. Same for `volatile-lru` fix (Decision #6 vs Task 1 yaml).

**Theme 2 — Frontend deployment risk (HIGH).** CORS, silent refresh, error codes, localStorage cleanup all interact. Frontend dev needs concrete handoff or this PR breaks the web app.

**Theme 3 — Operational observability gap (MEDIUM).** Redis health binary, no metrics export, no audit query runbook, no retention. SRE/compliance can't operate this system without additional runbooks.


---

## /autoplan Revision Summary (applied 2026-05-06)

Plan revised after `/autoplan` review caught CRITICAL gaps. All HIGH+ findings baked into task body:

| Finding (severity) | Source | Applied as |
|---|---|---|
| Express migration not called out | Eng #19 | **Task 0.5 NEW** — Express + expressMiddleware (gating) |
| `volatile-lru` instead of `allkeys-lru` | CEO #6 + Eng #23 + DX #11 | Task 1 yaml updated |
| `pnpm db:up` doesn't include Redis | DX #6 | Task 1 root package.json + .env.example added |
| 4 envs centralized (REDIS_URL, COOKIE_SECURE, CORS_ORIGIN, TRUST_PROXY_HOPS) | DX #6 | Task 1 config.ts + .env.example |
| RequestContext extension explicit | Eng #15 | Task 0.5 makes it concrete (was parenthetical) |
| CSRF mutation detection via AST not string | Eng #20 | Task 11 uses `graphql.parse` + `OperationDefinitionNode.operation === 'mutation'` |
| 5 distinct CSRF error codes via `extensions.code` | DX #3 | Task 11 csrfErr() helper + 5 codes |
| CORS package wired with credentials + exact origin | Eng #16 + DX #5 | Task 11 adds cors install + config |
| `trust proxy` set | Eng #17 | Task 11 boot uses `app.set('trust proxy', config.TRUST_PROXY_HOPS)` |
| **Task 13b silent refresh — Apollo errorLink** | CEO #9 + Eng #13 + DX #1 | **Task 13b NEW** — full errorLink with single-flight refresh + retry + REFRESH_EXPIRED routing |
| localStorage cleanup migration | DX #10 | Task 13 step 2 + main.ts boot cleanup |
| Rate limit JSON 429 handler | DX #8 | Task 15 jsonRateLimitHandler |
| Rate limit numbers bumped 100→300/IP, 500→1000/user | CEO #7 | Task 15 rate-limit.ts |
| Lockout key = email+IP (DoS defense) | Eng #18 | Task 15 lockoutKey() helper |
| Lockout error message generic (no attempt count) | CEO #5 | Task 15 step 5 — OWASP ASVS L2 V2.2.1 |
| **Refresh token atomic move via Lua** | Eng #12 | **Task 16** — ATOMIC_MOVE_LUA script replaces 3-op race |
| `REFRESH_EXPIRED` code (was `INVALID_REFRESH`) | DX #28 | Task 16 + Task 13b consistent |
| `logAudit` takes primitives, not ctx | DX #4 | Task 17 signature change + Task 18 callsites updated |
| Audit retention + runbook documented | DX #36 + #37 | Task 17 doc block + Task 19 CLAUDE.md |
| **Task 19 NEW — CLAUDE.md cache+auth+audit sections** | DX #31 | Task 19 written |
| **Task 20 NEW — Bearer removal exit criteria** | Eng #14 + DX #33 | Task 20 written with A/B/C exit criteria |

**Tasks added: 4 (T0.5, T13b, T19, T20). Total now: 20.**

**Standard chosen (per user "kalo mau nerapin standard tertentu, boleh juga sih kamu bebas pilih"):** OWASP ASVS L2 baseline (V2 auth, V3 session, V4 access control, V8 data protection, V10 logging) + ISO 27001 / SNI ISO 27001 alignment for Indonesian gov customer compliance ask.

**Voice source:** `[subagent-only]` — Codex 402 deactivated_workspace.

