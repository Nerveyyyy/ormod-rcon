#!/bin/bash
set -e

SERVER_NAME="${SERVER_NAME:-MyOrmodServer}"
GAME_BINARY_NAME="${GAME_BINARY_NAME:-ORMODDirective}"

echo "╔══════════════════════════════════════════════╗"
echo "║   ORMOD: Directive — Dedicated Server        ║"
echo "╠══════════════════════════════════════════════╣"
printf  "║  Name:   %-35s║\n" "$SERVER_NAME"
printf  "║  Binary: %-35s║\n" "$GAME_BINARY_NAME"
echo "║  Ports:  configured via serversettings.json ║"
echo "╚══════════════════════════════════════════════╝"

# Ensure binary is executable (host filesystem permissions may vary)
chmod +x "/home/steam/ormod/${GAME_BINARY_NAME}" 2>/dev/null || true

exec "/home/steam/ormod/${GAME_BINARY_NAME}" \
  -batchmode \
  -nographics \
  -servername "$SERVER_NAME"
