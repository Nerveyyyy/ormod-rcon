#!/bin/sh
# entrypoint-dashboard.sh
#
# Runs briefly as root to fix ownership on volume-mounted directories, then
# drops privileges to the non-root `dashboard` user (UID 1001) for the main
# process.  This pattern is required because Docker mounts volumes as root by
# default and Dockerfile USER directives cannot chown at mount time.
#
# Only the three volume-mount paths are touched — the rest of the container
# filesystem is already owned correctly from the build stage.

set -e

# Silence errors if a volume is not mounted (e.g. local dev without /saves)
chown -R dashboard:dashboard /data /backups /saves 2>/dev/null || true

# Run Prisma migration + start server as the non-root dashboard user.
# `gosu` is equivalent to `su-exec` — it executes the command with the new UID
# without spawning a shell child process (clean signal forwarding).
exec gosu dashboard sh -c "npx prisma db push && node dist/src/server.js"
