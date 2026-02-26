#!/bin/sh
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

# Fix ownership on all mounted directories so the steam user can read/write them.
# This runs briefly as root (entrypoint starts as root) then drops via gosu.
#
# /home/steam/ormod      — game binary bind-mount: chowned so the game can
#                          write crash dumps / temp files next to its binary.
# /home/steam/.config/…  — saves / config volume: chowned so the game can
#                          create and update server save files.
chown -R steam:steam /home/steam/ormod || true
chown -R steam:steam /home/steam/.config/ORMOD/Playtest || true

# Ensure binary is executable (host filesystem permissions may vary).
chmod +x "/home/steam/ormod/${GAME_BINARY_NAME}" || true

exec gosu steam "/home/steam/ormod/${GAME_BINARY_NAME}" \
  -batchmode \
  -nographics \
  -servername "$SERVER_NAME"
