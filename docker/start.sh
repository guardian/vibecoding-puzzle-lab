#!/bin/sh
set -eu

# In the container enironvment, /var/lib/nginx is a tmp mount. Create the necessary directories so nginx can start up.
mkdir -p /var/lib/nginx/html
mkdir -p /var/lib/nginx/logs
mkdir -p /var/lib/nginx/modules
mkdir -p /var/lib/nginx/run
mkdir -p /var/lib/nginx/tmp

su appuser -c "node /app/server/local.js" &
node_pid="$!"

trap 'kill -TERM "$node_pid" 2>/dev/null || true' INT TERM

nginx -g 'daemon off;'
status="$?"

kill -TERM "$node_pid" 2>/dev/null || true
wait "$node_pid" 2>/dev/null || true

exit "$status"