# Helyx web — Vue 3 + Vite, built to static assets, served by nginx.
# nginx also reverse-proxies /graphql + /auth + /health to the backend
# Service so the BROWSER only ever talks to app.th (same-origin) — this
# is required: the auth model uses SameSite=Strict cookies + CSRF, which
# would break across app.th ↔ api-app.th. api-app.th stays exposed
# separately for direct API consumers. Build context = repo ROOT.
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @helyx/web...
COPY apps/web apps/web
RUN pnpm --filter @helyx/web build

FROM nginx:1.27-alpine AS run
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
