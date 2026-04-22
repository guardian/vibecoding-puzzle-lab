#!/bin/sh
set -eu

node /app/server/local.js &
node_pid="$!"

trap 'kill -TERM "$node_pid" 2>/dev/null || true' INT TERM

nginx -g 'daemon off;'
status="$?"

kill -TERM "$node_pid" 2>/dev/null || true
wait "$node_pid" 2>/dev/null || true

exit "$status"