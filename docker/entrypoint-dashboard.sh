#!/bin/sh
# No longer used — dashboard runs as root via CMD in Dockerfile.
# Kept for reference / backwards compatibility.
set -e
exec sh -c "npx prisma db push && node dist/src/server.js"