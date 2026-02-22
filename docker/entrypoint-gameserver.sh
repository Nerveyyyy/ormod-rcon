#!/bin/bash
set -e

SERVER_NAME="${SERVER_NAME:-MyOrmodServer}"

echo "╔══════════════════════════════════════════════╗"
echo "║   ORMOD: Directive — Dedicated Server        ║"
echo "╠══════════════════════════════════════════════╣"
printf  "║  Name:  %-36s║\n" "$SERVER_NAME"
echo "║  Ports: configured via serversettings.json  ║"
echo "╚══════════════════════════════════════════════╝"

# Ensure binary is executable (host filesystem permissions may vary)
chmod +x /home/steam/ormod/ORMODDirective 2>/dev/null || true

exec /home/steam/ormod/ORMODDirective \
  -batchmode \
  -nographics \
  -servername "$SERVER_NAME"
