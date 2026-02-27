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

# Symlink so the game's hardcoded save path writes to our /saves volume.
# Game expects: $HOME/.config/ORMOD/Playtest/<ServerName>/
# Actual files: /saves/<ServerName>/
mkdir -p /root/.config/ORMOD
ln -sfn /saves /root/.config/ORMOD/Playtest

chmod +x "/game/${GAME_BINARY_NAME}" || true

exec "/game/${GAME_BINARY_NAME}" \
  -batchmode \
  -nographics \
  -servername "$SERVER_NAME"