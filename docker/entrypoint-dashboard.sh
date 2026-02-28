#!/bin/sh
set -e
# Ensure volume-mounted paths are owned by dashboard user before dropping privileges
chown -R 1001:1001 /data /backups /saves 2>/dev/null || true
# Drop to non-root and run migrations + server
exec su-exec dashboard sh -c "node node_modules/.bin/prisma db push && node dist/src/server.js"
