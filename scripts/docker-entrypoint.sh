#!/bin/sh
set -e
# The uploads directory is usually a host bind mount owned by root; hand it to the
# unprivileged "node" user, then drop root before running anything else.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOAD_DIR"
  chown node:node "$UPLOAD_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi
node migrate.mjs
exec node server.js
