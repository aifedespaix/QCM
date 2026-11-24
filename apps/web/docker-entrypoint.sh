#!/bin/sh
# Lance le serveur de rendu (Node, port 4321 local) puis nginx (port 80).
# Si l'un des deux s'arrête, le conteneur s'arrête aussi : Docker le relance (restart: unless-stopped).
set -eu

node /srv/ssr/entry.mjs &
node_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

stop() {
  kill "$node_pid" "$nginx_pid" 2>/dev/null || true
}
trap 'stop; exit 0' INT TERM

while kill -0 "$node_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 2
done
echo "qcm-web : un des processus s'est arrêté, arrêt du conteneur." >&2
stop
exit 1
