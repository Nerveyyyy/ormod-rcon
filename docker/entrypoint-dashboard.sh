#!/bin/sh
set -e

# Ensure the DB directory is writable by the dashboard user (UID 1001).
# /app/data is a named Docker volume — it persists the SQLite database.
mkdir -p /app/data
chown -R 1001:1001 /app/data

# Make the Docker socket accessible to the non-root dashboard user.
# Read the socket's owning GID and add the dashboard user to that group.
# This avoids chown/chmod on the bind-mounted socket, which would alter
# the host's socket permissions and break Docker access for host users.
if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
  if ! getent group "$SOCK_GID" > /dev/null 2>&1; then
    groupadd -g "$SOCK_GID" dockersock
  fi
  SOCK_GROUP=$(getent group "$SOCK_GID" | cut -d: -f1)
  usermod -aG "$SOCK_GROUP" dashboard
fi

exec gosu dashboard sh -c "
  ./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma
  node dist/src/server.js
"
