<p align="left">
  <img src="apps/web/public/helyx-mark.svg" width="56" alt="Helyx" />
</p>

# Helyx

Graph-native threat-intel platform. First vertical: **vulnerability +
exposure management**. Everything is a graph — CVE, Product, Vendor,
Asset, Stakeholder, ThreatActor, TTP (MITRE), IOC, DetectionRule are
nodes; relations are first-class edges.

> The load-bearing product brief lives in [`command.MD`](command.MD)
> (Bahasa Indonesia) — read it before any architectural change. This
> file is the on-ramp.

## Stack

- **Backend** — Apollo Server 4 (GraphQL) + Neo4j driver, ESM
  TypeScript. Listens on `:4000/graphql`.
- **Web** — Vue 3 + Vite + TypeScript + Tailwind + Apollo Client.
- **Stores** — Neo4j 5 (primary graph store, community + APOC) ·
  Redis (auth cache, CSRF, refresh JTI, rate-limit, single-flight).
- **Tooling** — pnpm workspace monorepo.

## Repo layout

```
apps/backend     Apollo GraphQL + Neo4j (resolvers ⇄ repo boundary)
apps/web         Vue 3 SPA
docs/            specs + plans (master-plan, polymorphic-R, ...)
Project/Kubernetes/helyx   k3s + Fleet + Longhorn deploy manifests
.github/workflows          fan-out CI (deploy-backend, deploy-web)
docker-compose.yml         local Neo4j + Redis
command.MD                 product brief (Bahasa Indonesia)
```

## Local development

```bash
corepack enable                 # one-time (pnpm)
pnpm install
cp .env.example .env            # then fill required vars (below)
pnpm db:up                      # docker compose: neo4j + redis
pnpm --filter @helyx/backend migrate     # apply Neo4j migrations
pnpm dev                        # backend :4000 + web :5173 (parallel)
```

Web dev server proxies `/graphql` → backend, so only `:5173` needs to
be reachable (no CORS / cross-origin cookie dance).

**Required env** (`apps/backend/src/config.ts` is the source of truth):

| Var | Notes |
|---|---|
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | required |
| `JWT_SECRET` | ≥32 chars · `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` |
| `CTI_SIGNING_MASTER_KEY` | 64 hex (32 bytes); needed before first STIX export |
| `REDIS_URL` | defaults `redis://localhost:6379` |
| `NVD_API_KEY` | optional; 650ms vs 6.5s sync rate |

## Data sync

```bash
pnpm --filter @helyx/backend nvd:sync      # NVD daily delta
pnpm --filter @helyx/backend elk:sync      # bulk CVE backfill from ELK
pnpm --filter @helyx/backend migrate:status
```

Sync state is resumable (`(:_SyncState)`), so a missed run self-heals
on the next.

## Architecture (highlights)

- **Migrations are the schema SoT** — `apps/backend/src/migrations/`,
  append-only `mNNN_*.ts`, `IF NOT EXISTS`, never edit an applied one.
- **Tenant discipline** — every tenant node carries `tenantId`; repos
  take it as a required arg; resolvers `assertOrgRole` then pass it.
- **Auth** — cookie + CSRF + refresh rotation (OWASP ASVS L2). The SPA
  is same-origin; see the deploy note below.
- **CTI governance** — F1 release tier · F2 Ed25519-signed approvals ·
  F3 redaction/PDN egress · STIX 2.1 export. Never bypass the gates.
- **Stakeholder** is polymorphic via `kind` (ORG|SUBUNIT|VENDOR|
  PERSON|FACILITY); the deeper Org→Stakeholder collapse is the
  deferred Phase R (`docs/plans/2026-05-08-polymorphic-stakeholder-refactor.md`).

## Deployment (Kubernetes — k3s + Fleet + Longhorn)

Manifests + ops docs: [`Project/Kubernetes/helyx/`](Project/Kubernetes/helyx/README.md).

- **Fan-out CI** — `.github/workflows/deploy-{backend,web}.yml` build &
  push `ghcr.io/huntingyuk/helyx-{backend,web}` and bump that
  component's manifest (path-filtered: a web change never rebuilds the
  backend). Needs repo secret `MANIFEST_REPO_TOKEN`.
- **Domains** — `app.th` (SPA) + `api-app.th` (direct API). The web
  pod's nginx reverse-proxies `/graphql`+`/auth` to the backend so the
  browser stays same-origin — required, the SameSite=Strict cookie/CSRF
  auth cannot work cross-host.
- **Stateful** — Neo4j + Redis as Longhorn-backed StatefulSets. Neo4j
  community is single-instance (scale vertically). Stateless tiers
  (backend/web) scale by replicas/HPA.
- **Secrets are Vault-ready** — every workload reads one Secret via
  `envFrom`; ESO/VSO swaps only the source, zero workload changes.

## Sibling project

The hand-written Suricata ruleset lives in a separate repo
(`Rules/Suricata`, rules-authoring only) — follow *its own* spec and
contract, not these conventions, when working there.

---

Private — © HuntingYuk. Not for redistribution.
