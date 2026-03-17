#!/bin/sh
set -e

SERVER_NAME="${SERVER_NAME:-MyOrmodServer}"
GAME_BINARY_NAME="${GAME_BINARY_NAME:-ORMODDirective}"

echo "[gameserver] Starting: $SERVER_NAME (binary: $GAME_BINARY_NAME)"

# Fix volume permissions so the non-root gameserver user can write
chown -R gameserver:gameserver /saves /game 2>/dev/null || true
chmod +x "/game/${GAME_BINARY_NAME}" 2>/dev/null || true

# Set up the save path symlink as root before dropping privileges
mkdir -p /home/gameserver/.config/ORMOD
ln -sfn /saves /home/gameserver/.config/ORMOD/Playtest
chown -R gameserver:gameserver /home/gameserver/.config

# Drop to non-root and run the game.
# gosu exec-replaces itself so the game binary becomes PID 1 and
# directly receives stdin from Docker attach (command dispatch).
exec gosu gameserver "/game/${GAME_BINARY_NAME}" -batchmode -nographics -servername "${SERVER_NAME}"
