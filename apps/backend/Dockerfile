# Helyx backend — Apollo GraphQL + Neo4j. Build context = repo ROOT
# (pnpm workspace monorepo). Multi-stage: tsc build → slim node runner.
# Same image also runs migrate (initContainer) + nvd cron, via cmd override.
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @helyx/backend...
COPY apps/backend apps/backend
RUN pnpm --filter @helyx/backend build

FROM node:22-alpine AS run
WORKDIR /app/apps/backend
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/backend/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/package.json ./package.json
EXPOSE 4000
USER node
# server (default). migrate:  node dist/migrations/cli.js up
# nvd cron: node dist/sources/nvd/cli.js  · scheduler: node dist/scheduler/cli.js
CMD ["node", "dist/index.js"]
