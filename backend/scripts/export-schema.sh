#!/bin/sh
# Exporte les collections de l'instance locale vers backend/pb_schema.json
# (fichier importable dans Dashboard > Settings > Import collections).
# Usage : PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... sh backend/scripts/export-schema.sh
set -eu
PB_URL="${PB_URL:-http://127.0.0.1:8090}"
TOKEN=$(curl -fsS "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).token)')
curl -fsS "$PB_URL/api/collections?perPage=200&filter=(name='users'||name='qcms'||name='ratings'||name='comments')" \
  -H "Authorization: $TOKEN" | bun -e 'console.log(JSON.stringify(JSON.parse(await Bun.stdin.text()).items, null, 2))' > "$(dirname "$0")/../pb_schema.json"
echo "OK backend/pb_schema.json"
