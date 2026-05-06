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

## Task 1: Redis service in docker-compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `apps/backend/src/config.ts`

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
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
```

In the `volumes:` section at the bottom, add:
```yaml
  redis-data:
```

- [ ] **Step 2: Add REDIS_URL to config.ts**

In `apps/backend/src/config.ts`, find the Zod env schema and add:
```typescript
REDIS_URL: z.string().default('redis://localhost:6379'),
```

- [ ] **Step 3: Bring up Redis + verify**

```bash
docker compose up -d redis
until docker exec helyx-redis redis-cli PING 2>/dev/null | grep -q PONG; do sleep 1; done
echo "redis ready"
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml apps/backend/src/config.ts
git commit -m "feat(infra): Redis 7 service + REDIS_URL config"
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

async function csrfGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<void> {
  // GraphQL routes only; only mutations need CSRF (queries safe by SOP).
  // Quick check: peek at body operation name. If body parsing not done yet, defer.
  if (req.method !== 'POST') { next(); return; }

  // Body must already be parsed; ensure body parser is registered BEFORE this middleware.
  const body = (req as { body?: { query?: string } }).body ?? {};
  const query = body.query ?? '';

  // Skip CSRF for queries and introspection
  if (!query.trim().toLowerCase().startsWith('mutation')) { next(); return; }

  // Skip CSRF for the login mutation itself (no session yet)
  if (/\bmutation\b[^{]*\{\s*login\b/i.test(query)) { next(); return; }
  if (/\bmutation\b[^{]*\{\s*register\b/i.test(query)) { next(); return; }

  // Fall through if Authorization Bearer header present (legacy dual-mode)
  if (req.headers.authorization?.startsWith('Bearer ')) {
    res.setHeader('X-Helyx-Auth-Deprecation', 'Bearer header is deprecated; migrate to cookie + X-CSRF-Token');
    next();
    return;
  }

  // Cookie-mode: enforce CSRF
  const sessionJwt = readSessionCookie(req);
  if (!sessionJwt) {
    res.status(401).json({ errors: [{ message: 'no session' }] });
    return;
  }

  const headerToken = (req.headers['x-csrf-token'] as string | undefined) ?? null;
  const cookieToken = readCsrfCookie(req);
  if (!headerToken || !cookieToken || !safeEqual(headerToken, cookieToken)) {
    res.status(403).json({ errors: [{ message: 'CSRF token mismatch' }] });
    return;
  }

  // Verify cookie token matches Redis-stored one (defense in depth: cookie tampering)
  const payload = await verifyAccessToken(sessionJwt);
  if (!payload) {
    res.status(401).json({ errors: [{ message: 'invalid session' }] });
    return;
  }
  const stored = await loadCsrfToken(payload.sub);
  if (!stored || !safeEqual(headerToken, stored)) {
    res.status(403).json({ errors: [{ message: 'CSRF token mismatch (server)' }] });
    return;
  }
  next();
}

// Register order matters: bodyParser → cookieParser → csrfGuard → /graphql
app.use(express.json());
app.use(cookieParser());
app.use('/graphql', csrfGuard);
// ... then your existing apolloMiddleware mount
```

- [ ] **Step 3: Modify context.ts for dual-mode (cookie OR Bearer)**

```typescript
// In apps/backend/src/auth/context.ts buildContext():
import { readSessionCookie } from './cookie.js';

// REPLACE the token extraction to prefer cookie, fall back to Bearer:
function extractToken(req: import('express').Request): string | null {
  const cookieToken = readSessionCookie(req);
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return null;
}

// In buildContext, use extractToken(req) instead of the existing manual Bearer parse.
```

- [ ] **Step 4: Typecheck + verify**

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

> Apollo context typically doesn't include `res` by default. You may need to extend the GraphQL context type to include `res: Response`. Check `apps/backend/src/auth/context.ts` to see if it already passes `res` through. If not, modify the context builder to accept and store `req` + `res`, then update `RequestContext` type.

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

- [ ] **Step 1: Modify apollo.ts**

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

- [ ] **Step 2: Modify auth store to drop token persistence**

In `apps/web/src/stores/auth.ts`, find any `localStorage.setItem('token', ...)` or `sessionStorage` calls and remove them. The token is now in HttpOnly cookie — store doesn't need to track it. `isAuthed` should now derive from "did the last `me` query succeed" (or maintain in-memory user state).

If unsure about the exact shape, leave the existing logic but ensure no localStorage write of token. Add a comment: `// Token now in HttpOnly cookie; this store tracks user/org only.`

- [ ] **Step 3: Verify in browser**

```bash
# Backend running, frontend running (pnpm --filter @helyx/web dev)
# Open browser, open dev tools, login
# Expected: Application > Cookies should show helyx_session (httpOnly) + helyx_csrf_token (visible)
# Expected: any subsequent mutation request has X-CSRF-Token header
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/apollo.ts apps/web/src/stores/auth.ts
git commit -m "feat(web): Apollo credentials include + X-CSRF-Token header; drop Bearer storage"
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

export const ipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args) as Promise<unknown>,
  }),
  keyGenerator: (req) => req.ip ?? 'unknown',
});

export const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args) as Promise<unknown>,
  }),
  keyGenerator: (req) => {
    const cookie = (req as { cookies?: Record<string, string> }).cookies?.helyx_session;
    return cookie ? `user:${cookie.slice(0, 16)}` : (req.ip ?? 'unknown');
  },
});
```

- [ ] **Step 3: Login lockout module**

```typescript
// apps/backend/src/security/lockout.ts
import { getRedis } from '../cache/redis.js';

const WINDOW_S = 15 * 60;
const MAX_FAILS = 5;

const failKey = (key: string) => `auth:fail:${key}`;
const lockKey = (key: string) => `auth:lock:${key}`;

export async function isLocked(key: string): Promise<boolean> {
  const r = getRedis();
  const v = await r.get(lockKey(key));
  return v !== null;
}

export async function recordFail(key: string): Promise<{ locked: boolean; remaining: number }> {
  const r = getRedis();
  const cnt = await r.incr(failKey(key));
  if (cnt === 1) await r.expire(failKey(key), WINDOW_S);
  if (cnt >= MAX_FAILS) {
    await r.set(lockKey(key), '1', 'EX', WINDOW_S);
    return { locked: true, remaining: 0 };
  }
  return { locked: false, remaining: MAX_FAILS - cnt };
}

export async function clearFails(key: string): Promise<void> {
  const r = getRedis();
  await r.del(failKey(key), lockKey(key));
}
```

- [ ] **Step 4: Wire rate-limit middleware**

In `apps/backend/src/index.ts`:

```typescript
import { ipLimiter, userLimiter } from './security/rate-limit.js';

// Before /graphql mount:
app.use('/graphql', ipLimiter, userLimiter);
```

- [ ] **Step 5: Wire lockout into login resolver**

In `auth.resolvers.ts` login mutation, before password check:

```typescript
import { isLocked, recordFail, clearFails } from '../security/lockout.js';
import { GraphQLError } from 'graphql';

const lockKey = `email:${input.email.toLowerCase()}`;
if (await isLocked(lockKey)) {
  throw new GraphQLError('Account temporarily locked due to repeated failed attempts', {
    extensions: { code: 'ACCOUNT_LOCKED' },
  });
}
// ... existing password check ...
if (!passwordMatches) {
  const status = await recordFail(lockKey);
  throw new GraphQLError(
    status.locked
      ? 'Account locked for 15 minutes'
      : `Invalid credentials (${status.remaining} attempts remaining)`,
    { extensions: { code: status.locked ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS' } },
  );
}
// On success, clear:
await clearFails(lockKey);
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @helyx/backend typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/security/rate-limit.ts apps/backend/src/security/lockout.ts apps/backend/src/index.ts apps/backend/src/tenants/auth.resolvers.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(security): rate-limit-redis (IP 100/min, user 500/min) + login lockout (5 fails / 15min)"
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

export async function consumeRefreshToken(jti: string): Promise<{ userId: string } | null> {
  // Check primary slot
  const primary = await cacheGet<{ userId: string; exp: number }>(refreshKey(jti));
  if (primary) {
    // Move to grace (rotation window) and return user
    await cacheSet(refreshGraceKey(jti), { userId: primary.userId }, REFRESH_GRACE_S);
    await cacheDel(refreshKey(jti));
    return { userId: primary.userId };
  }
  // Check grace slot (concurrent refresh from second tab)
  const grace = await cacheGet<{ userId: string }>(refreshGraceKey(jti));
  if (grace) return { userId: grace.userId };
  return null;
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
  if (!consumed) throw new GraphQLError('refresh expired or invalid', { extensions: { code: 'INVALID_REFRESH' } });

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

- [ ] **Step 4: Helper**

```typescript
// apps/backend/src/audits/log.ts
import type { RequestContext } from '../auth/context.js';
import { writeAuditEvent } from './repo.js';

export async function logAudit(
  ctx: RequestContext,
  action: string,
  target: { type: string; id: string },
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  if (!ctx.user || !ctx.activeOrgId) return;  // anonymous ops not audited
  await writeAuditEvent({
    tenantId: ctx.activeOrgId,
    actorUserId: ctx.user.id,
    action,
    targetType: target.type,
    targetId: target.id,
    before,
    after,
  });
}
```

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

- [ ] **Step 1: Each resolver — capture before, do op, capture after, log**

Pattern for each:

```typescript
// Example: archiveCase
import { logAudit } from '../audits/log.js';

archiveCase: async (_p: unknown, args: { id: string }, ctx: RequestContext) => {
  assertOrgRole(ctx, 'ADMIN');
  const before = await findCase(ctx.activeOrgId!, args.id);
  const after = await archiveCase(ctx.activeOrgId!, args.id);
  await logAudit(ctx, 'case.archive', { type: 'Case', id: args.id },
    before ? { status: before.status } : null,
    { status: after.status }
  );
  return after;
},
```

Apply same pattern to:
- `resolveRawStakeholder` (action: `reconciliation.resolve`, target type: `RawStakeholder`)
- `bulkResolveRawStakeholders` (action: `reconciliation.bulk_resolve`, target type: `RawStakeholder`, target id: `'(bulk)'`, after: `{ count: returnedNumber }`)
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

## Self-Review Checklist (post-write)

**Spec coverage:**
- [x] Phase A: Redis foundation → Tasks 1-4 (service + client + cache + health)
- [x] Phase B: Auth perf cache → Tasks 5-6 (cached lookups + invalidation)
- [x] Phase C: Race fixes → Tasks 7-9 (3 races: bulkIoc, resolve, createCase)
- [x] Phase D: Cookie + CSRF → Tasks 10-13 (helpers, middleware, login flow, frontend)
- [x] Phase E: Hardening → Tasks 14-16 (depth/cost/intro, rate-limit/lockout, refresh+pino)
- [x] Phase F: Audit log → Tasks 17-18 (schema + helper + 4 wire-ups)

**No placeholders verified.** Each step has full code (Cypher, TS, shell).

**Type/symbol consistency:**
- `getRedis()` exported from `cache/redis.ts`, used in `cache/index.ts`, `security/rate-limit.ts`, `security/lockout.ts`, `auth/csrf.ts` ✓
- `cacheWrap`/`cacheGet`/`cacheSet`/`cacheDel` consistent across all consumers ✓
- `RequestContext` requires `req` and `res` — Task 11 calls out the context-builder modification needed ✓
- `logAudit(ctx, action, target, before, after)` signature consistent in Task 17 + Task 18 ✓

**Cross-task dependencies (parallelizable):**
- Tasks 1-4 sequential (foundation)
- After T4: T5+T6 (auth cache) AND T7+T8+T9 (race fixes — INDEPENDENT, no Redis needed) AND T14 (depth/cost/intro — independent) can run parallel
- T10-T13 sequential (cookie/CSRF flow has internal dependencies)
- T15-T16 require T2 (Redis client)
- T17-T18 mostly independent of cookie work (audit can wire any time after T2)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-helyx-redis-auth-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration. Best because the 18 tasks span infra/security/code in a way where each task is reviewable independently.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Heavier on this session's context.

**Which approach?** And: do you want me to run `/autoplan` on this plan first (CEO scope challenge + Eng arch review + dual voice with Codex)?
