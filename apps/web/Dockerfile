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

# nginx sert les fichiers générés et relaie /api vers PocketBase ; les pages dynamiques (bibliothèque,
# fiches, plan du site) sont rendues par le serveur Node d'Astro, dans le même conteneur.
FROM nginx:1.29-alpine
RUN apk add --no-cache nodejs
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker-entrypoint.sh /docker-entrypoint-qcm.sh
# L'adaptateur Node exige la disposition du build : `…/server/entry.mjs` avec `…/client` à côté.
# nginx sert ce même dossier `client`. Le serveur est autonome (dépendances incluses) : pas de node_modules.
COPY --from=build /repo/apps/web/dist /srv/qcm
RUN chmod +x /docker-entrypoint-qcm.sh && mkdir -p /var/cache/nginx/ssr && chown nginx:nginx /var/cache/nginx/ssr
ENV HOST=127.0.0.1 PORT=4321 NODE_ENV=production
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint-qcm.sh"]
