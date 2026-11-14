#!/bin/sh
set -eu

# Crée ou met à jour le compte administrateur à chaque démarrage (idempotent).
if [ -n "${PB_SUPERUSER_EMAIL:-}" ] && [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  /pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb/pb_data
fi

exec /pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --hooksDir=/pb/pb_hooks \
  --migrationsDir=/pb/pb_migrations \
  --encryptionEnv=PB_ENCRYPTION_KEY \
  --origins="${PB_ALLOWED_ORIGINS:-*}"
