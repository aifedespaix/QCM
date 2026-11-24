#!/bin/sh
# Lance nginx (port 80) et le serveur de rendu Node (port 4321, local).
# Si Node s'arrête, il est relancé ici : nginx continue de servir les pages générées et les
# dernières copies en cache pendant ce temps. Si nginx s'arrête, le conteneur s'arrête (Docker le relance).
set -u

nginx -g 'daemon off;' &
nginx_pid=$!

(
  while true; do
    node /srv/qcm/server/entry.mjs
    echo "qcm-web : serveur de rendu arrêté (code $?), relance dans 5 s." >&2
    sleep 5
  done
) &
node_loop_pid=$!

stop() {
  kill "$node_loop_pid" 2>/dev/null || true
  pkill -f /srv/qcm/server/entry.mjs 2>/dev/null || true
  kill "$nginx_pid" 2>/dev/null || true
}
trap 'stop; exit 0' INT TERM

while kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 2
done
echo "qcm-web : nginx s'est arrêté, arrêt du conteneur." >&2
stop
exit 1
