# Contexte de build : racine du monorepo (voir docker-compose.yml).
FROM oven/bun:1.4 AS build
WORKDIR /repo
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/desktop/package.json ./apps/desktop/package.json
RUN bun install --frozen-lockfile
ARG PUBLIC_PB_URL
ARG PUBLIC_SITE_URL
ARG PUBLIC_RELEASES_URL
ENV PUBLIC_PB_URL=$PUBLIC_PB_URL PUBLIC_SITE_URL=$PUBLIC_SITE_URL PUBLIC_RELEASES_URL=$PUBLIC_RELEASES_URL
RUN bun run --filter @qcm/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
