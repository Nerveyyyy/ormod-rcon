#!/bin/sh
set -e

# Ensure the DB directory is writable by the dashboard user (UID 1001).
# /app/data is a named Docker volume — it persists the SQLite database.
mkdir -p /app/data
chown -R 1001:1001 /app/data

# Make the Docker socket accessible to the non-root dashboard user.
# The socket is owned by root:docker on the host — the dashboard user
# isn't in that group, so we widen permissions before dropping privileges.
if [ -S /var/run/docker.sock ]; then
  chmod 660 /var/run/docker.sock
  chown root:1001 /var/run/docker.sock
fi

exec gosu dashboard sh -c "
  ./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma
  node dist/src/server.js
"
