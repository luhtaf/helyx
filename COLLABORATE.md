# COLLABORATE.md

This file documents repositories that **integrate with Helyx**. Read this before changing the GraphQL schema or removing public-facing fields — there are external consumers.

## Sibling repo: `landing-page`

- **Path (local dev):** `/Users/fathulikhsan/Programming/next/landing-page`
- **Local shortcut:** `./landing-page` (gitignored symlink in this repo root — read files directly via this path)
- **GitHub:** `HuntingYuk/landing-page`
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma + Postgres (its own DB, app launcher only)
- **Role:** Executive-level cinematic dashboard for pimpinan TNI / external showcase

> **AI working in Helyx — read these in landing-page before changing GraphQL schema or fields it consumes:**
> - `landing-page/CLAUDE.md` — its codebase guide
> - `landing-page/COLLABORATE.md` — landing's view of this integration (mirrors this file)

### Audience split

| Surface | Audience | Style | Data writes? |
|---|---|---|---|
| **Helyx web** (this repo's `apps/web`) | Analyst / threat hunter / admin | Vue + Tailwind, functional | Yes — full CRUD on master data, Cases, Hunts, Assets |
| **landing-page** (sibling) | Executive / pimpinan TNI / external visitors | Cyberpunk command-center, dark, animated maps | **No** — read-only consumer |

### Data flow

```
ELK (sumber CVE / hit IP)                  ← already-existing upstream
        │
        │  pnpm --filter @helyx/backend elk:sync
        ▼
Helyx Neo4j  (single graph: master + threat-intel + cases + sensors)
        │
        │  GraphQL @ :4000/graphql
        │
   ┌────┴─────────────────────┐
   │                          │
Helyx web                Landing-page (Next.js)
(operator UI)            server-side fetches via GraphQL
                         renders executive dashboards
```

**Landing never calls Helyx from the browser.** It uses Next.js API routes / server components to proxy GraphQL queries with a long-lived `viewer` service token. CORS / auth is handled server-side. Browser only sees pre-rendered visualisation data.

### Auth boundary

- Helyx has its own JWT auth — roles `admin` / `analyst` / `viewer`.
- Landing-page has its own local admin (sessionStorage token) for managing the app launcher CRUD on `/admin`. **Not migrated** to Helyx auth (separate concern, deliberately kept simple).
- Landing reads Helyx data with a long-lived `viewer` token stored in its server env (`HELYX_VIEWER_TOKEN`).
- For now Landing has no write path back to Helyx. If that ever changes, raise it as a Helyx PR — write access requires deliberate auth design.

### What Landing currently consumes (or will consume)

Pages in landing-page that pull from Helyx:

| Landing route | Helyx data needed |
|---|---|
| `/sensor-coverage` | `Stakeholder` list with `SensorDeployment` attribute (stack, status, agentCount, deployedAt) |
| `/compromise-assessment` | `Case` list with linked `Stakeholder` + summary verdict + artifact count (NOT individual artifacts — only metadata for spotlight) |
| `/vulnerability-map` | aggregated CVE counts grouped by `Stakeholder.coords` / `Sektor` |
| `/threat-map` (globe) | live attack feed from sensor data — TBD, currently mock |
| `/apps` (launcher) | none — uses local Postgres |
| `/admin` | none — uses local Postgres |

Landing consumed-fields registry: `landing-page/src/lib/helyx-queries.md` (TODO when first integration lands; until then, all Landing data is mock).

### When changing Helyx GraphQL schema

| Change kind | Coordination |
|---|---|
| Adding fields / new types | Safe. No coordination needed. |
| Adding required arguments to existing fields | Breaking. Coordinate. |
| Renaming / removing types or fields consumed by Landing | **Breaking.** PR description must list affected Landing pages, and the PR should land alongside (or before) Landing-side updates. |
| Changing semantics of consumed fields | Breaking. Same coordination rule. |
| Changing internal resolver behaviour, performance | Free hand. |

### Local dev pairing

If you're editing a query that Landing consumes:

```bash
# 1. Helyx backend running locally
pnpm db:up
pnpm --filter @helyx/backend dev   # graphql at :4000

# 2. Landing pointing at local Helyx
cd /Users/fathulikhsan/Programming/next/landing-page
HELYX_GRAPHQL_URL=http://localhost:4000/graphql \
HELYX_VIEWER_TOKEN=<generate via helyx admin> \
  npm run dev    # next at :3000
```

Then validate the change end-to-end before merging Helyx PR.

### Ownership of master data

Master data lives **here** (Helyx Neo4j). Landing is read-only. If you discover a master-data inconsistency while working on Landing, fix it in Helyx — do **not** patch around it client-side.

## Other consumers

(none yet — add to this file when more repos integrate)
