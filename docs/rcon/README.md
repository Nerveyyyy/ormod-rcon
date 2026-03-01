# ORMOD: Directive — RCON Protocol

**Version:** 1.0.0
**Transport:** WebSocket (`ws://` or `wss://`)
**Encoding:** UTF-8 JSON
**Max frame size:** 65 535 bytes
**Default port:** 28016 (set via `serversettings.json`)

The machine-readable type definitions live in [`schema.ts`](./schema.ts) alongside this file. This document is the human-readable companion — use it to understand the protocol, build integrations, or implement the server side.

---

## Contents

1. [Connection & Auth](#1-connection--auth)
2. [Message Framing](#2-message-framing)
3. [Commands — Quick Reference](#3-commands--quick-reference)
4. [Command Details](#4-command-details)
5. [Events — Quick Reference](#5-events--quick-reference)
6. [Event Details](#6-event-details)
7. [Player Data Schema](#7-player-data-schema)
8. [Error Codes](#8-error-codes)
9. [Implementation Notes](#9-implementation-notes)

---

## 1. Connection & Auth

### Auth Flow

```
Client opens WebSocket to ws://host:28016

Client sends:
  { "type": "auth", "secret": "your-rcon-password" }

Server replies (success):
  { "type": "auth_ok", "serverTime": "2026-03-01T14:32:00.000Z",
    "serverName": "My Server", "version": "1.0.0" }

Server replies (failure):
  { "type": "auth_error", "reason": "invalid_secret" }
  [server closes socket]
```

The secret is the value of `rconPassword` in `serversettings.json`.
No command is processed until `auth_ok` has been received.

### Auth Error Reasons

| Reason | Meaning |
|--------|---------|
| `invalid_secret` | Wrong password |
| `already_authenticated` | This connection already authed |
| `max_connections` | Server-side RCON connection limit reached |

### Keepalive

Send a `ping` every 30 seconds. If no `pong` is received within 10 seconds, treat the connection as dead and reconnect.

```json
→ { "type": "ping" }
← { "type": "pong", "serverTime": "2026-03-01T14:32:15.000Z" }
```

---

## 2. Message Framing

Every message is a single JSON object with a `type` field.

### Client → Server

| `type` | When to send |
|--------|-------------|
| `auth` | Immediately after connection opens |
| `command` | Any time after `auth_ok` |
| `ping` | Every ~30 s |

### Server → Client

| `type` | When |
|--------|------|
| `auth_ok` | Auth succeeded |
| `auth_error` | Auth failed |
| `result` | Response to a `command` |
| `event` | Server-push notification (no request) |
| `pong` | Response to `ping` |

### Command Wrapper

Wrap every command in a `CommandMessage`. Choose any unique string for `id` — the server echoes it in the `result` so you can match responses to requests even when multiple commands are in-flight.

```json
{
  "type": "command",
  "id": "req-001",
  "command": {
    "cmd": "kick",
    "steamId": "76561198001234567"
  }
}
```

### Result Wrapper

```json
// Success
{
  "type": "result",
  "id": "req-001",
  "success": true,
  "data": { "steamId": "76561198001234567" }
}

// Failure
{
  "type": "result",
  "id": "req-001",
  "success": false,
  "error": {
    "code": "PLAYER_NOT_ONLINE",
    "message": "Player 76561198001234567 is not currently connected."
  }
}
```

### Event Wrapper

```json
{
  "type": "event",
  "timestamp": "2026-03-01T14:33:00.000Z",
  "event": {
    "name": "player.join",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer"
  }
}
```

---

## 3. Commands — Quick Reference

**Permission levels:** `[server]` > `[admin]` > `[operator]` > `[client]`
All RCON connections hold `[server]`-level authority by default.

### [server] Commands

| `cmd` | Args | Description |
|-------|------|-------------|
| `setserversetting` | `setting`, `value` | Change a serversettings.json field |
| `setpermissions` | `steamId`, `level` | Grant a player a permission level |
| `removepermissions` | `steamId` | Revoke a player's permissions |
| `authenabled` | `enabled` | Toggle server-side authentication |
| `anticheatenabled` | `enabled` | Toggle the anti-cheat system |
| `forcesave` | — | Trigger an immediate server save |
| `wipe` | `type`, `steamId?` | Wipe map, player data, or both |

### [admin] Commands

| `cmd` | Args | Description |
|-------|------|-------------|
| `spawn` | `entity`, `steamId?`, `x/y/z?` | Spawn an entity at a location |
| `setdata` | `entityId`, `key`, `value` | Modify a world entity property |
| `noclip` | `steamId`, `enabled` | Toggle no-collision for a player |
| `godmode` | `steamId`, `enabled` | Toggle invulnerability for a player |
| `spectator` | `steamId`, `enabled` | Toggle spectator mode for a player |
| `enabletracers` | `enabled` | Show bullet trajectories server-wide |
| `forcerespawnloot` | — | Force immediate loot respawn |
| `getserversettings` | — | Read all current settings |
| `settime` | `time` | Set time of day (0–2400) |
| `setweather` | `weather` | Set weather state |
| `setfog` | `enabled` | Toggle fog |
| `setammo` | `enabled` | Toggle ammo consumption requirement |
| `teleport` | `steamId`, `toSteamId?` / `x/y/z?` | Move a player |
| `ban` | `steamId` | Permanently ban a player |
| `unban` | `steamId` | Remove a ban |
| `whitelist` | `steamId` | Add a player to the whitelist |
| `removewhitelist` | `steamId` | Remove from whitelist |
| `kill` | `steamId` | Kill a specific player |
| `killall` | — | Kill all online players |

### [operator] Commands

| `cmd` | Args | Description |
|-------|------|-------------|
| `getplayers` | — | List all online players |
| `getentity` | — | Identify targeted entity |
| `getbiome` | — | Get current biome |
| `seed` | — | Get world seed + location metadata |
| `getlocation` | — | Get current coordinates |
| `playerdata` | `steamId` | Full player record (online or offline) |
| `playerparty` | `steamId` | Player's current party |
| `playerinv` | `steamId` | Player's full inventory |
| `addxp` | `steamId`, `amount` | Grant experience points |
| `addeffect` | `steamId`, `stat`, `duration`, `amount` | Apply a status effect |
| `removeeffect` | `steamId`, `stat` | Remove a specific status effect |
| `cleareffects` | `steamId` | Remove all status effects |
| `unlockallskills` | `steamId` | Unlock all skill tree nodes |
| `unlockallblueprints` | `steamId` | Unlock all blueprints |
| `heal` | `steamId` | Restore player to full health |
| `announcement` | `message` | Broadcast to all players |
| `kick` | `steamId` | Remove a player (no ban) |

### [client] Commands

| `cmd` | Args | Description |
|-------|------|-------------|
| `gettime` | — | Get current server time |
| `getentities` | — | List spawnable entity names |
| `getworkbenches` | — | List workbench names |
| `getvehicles` | — | List vehicle names |
| `getenemies` | — | List enemy/creature names |
| `getstatuseffects` | — | List status effect names |

### Arena Commands

| `cmd` | Permission | Args | Description |
|-------|-----------|------|-------------|
| `setkit` | [admin] | `steamId`, `kitName` | Assign a loadout to a player |
| `setkitall` | [admin] | `kitName` | Assign a loadout to all participants |
| `setkitquality` | [admin] | `quality` | Set max item quality tier |
| `setteamspawn` | [operator] | `teamNumber` | Set team spawn point |
| `setteam` | [operator] | `steamId`, `teamNumber` | Assign player to a team |
| `startmatch` | [operator] | — | Begin the arena match |
| `getallkits` | [operator] | — | List all defined kit names |
| `getkits` | [client] | — | List available kits for the player |

---

## 4. Command Details

### `setserversetting`

Changes one field in `serversettings.json`. The file hot-reloads — no restart needed.

```json
→ { "type": "command", "id": "1", "command": {
    "cmd": "setserversetting",
    "setting": "MaxPlayers",
    "value": 32
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "setting": "MaxPlayers",
    "previous": 16,
    "current": 32
  }}
```

---

### `setpermissions` / `removepermissions`

Writes to `adminlist.txt`. Format on disk: `SteamId:level`.

```json
→ { "cmd": "setpermissions", "steamId": "76561198001234567", "level": "admin" }
← { "data": { "steamId": "76561198001234567", "level": "admin" } }

→ { "cmd": "removepermissions", "steamId": "76561198001234567" }
← { "data": { "steamId": "76561198001234567" } }
```

Valid levels: `server`, `admin`, `operator`, `client`

---

### `wipe`

**Type `map`** — Deletes world geometry data. Player inventories, skills, and XP survive.
**Type `playerdata`** — Deletes `PlayerData/<steamId>.json` files. World stays intact.
**Type `full`** — Both map and all player data.

```json
// Wipe the map only
→ { "cmd": "wipe", "type": "map" }
← { "data": { "type": "map", "durationMs": 340 } }

// Wipe one player's data
→ { "cmd": "wipe", "type": "playerdata", "steamId": "76561198001234567" }
← { "data": { "type": "playerdata", "steamId": "76561198001234567", "durationMs": 12 } }

// Full server wipe
→ { "cmd": "wipe", "type": "full" }
← { "data": { "type": "full", "durationMs": 420 } }
```

`steamId` is only valid when `type` is `"playerdata"`. Providing it with `"map"` or `"full"` returns `INVALID_ARGS`.

---

### `spawn`

Spawn priority: coordinates > steamId position > server error (RCON has no implicit position).

```json
// At a player's location
→ { "cmd": "spawn", "entity": "Bear", "steamId": "76561198001234567" }
← { "data": { "entity": "Bear", "location": { "x": 120.5, "y": 0.0, "z": -44.2 } } }

// At exact coordinates
→ { "cmd": "spawn", "entity": "IronOre", "x": 100, "y": 0, "z": 200 }
← { "data": { "entity": "IronOre", "location": { "x": 100, "y": 0, "z": 200 } } }
```

Entity names: see `getentities`, `getenemies`, `getworkbenches`, `getvehicles`.

---

### `teleport`

Exactly one destination must be provided: either `toSteamId` or all three of `x`, `y`, `z`.

```json
// Move player to another player
→ { "cmd": "teleport", "steamId": "76561198001234567", "toSteamId": "76561198007654321" }
← { "data": { "steamId": "76561198001234567",
    "from": { "x": 0, "y": 0, "z": 0 },
    "to":   { "x": 55, "y": 2, "z": -10 } } }

// Move player to coordinates
→ { "cmd": "teleport", "steamId": "76561198001234567", "x": 0, "y": 0, "z": 0 }
```

---

### `settime`

```json
→ { "cmd": "settime", "time": 600 }    // 06:00 (dawn)
← { "data": { "time": 600, "formatted": "06:00" } }
```

Valid range: 0–2400. Values outside range return `INVALID_ARGS`.

---

### `setweather`

Valid values: `cloudy`, `stormy`, `overcast`, `sparse`, `clear`, `lightningstorm`, `lightrain`

```json
→ { "cmd": "setweather", "weather": "stormy" }
← { "data": { "weather": "stormy" } }
```

---

### `playerdata`

Returns full stored data for any player, online or offline. This is a read of the `PlayerData/<steamId>.json` file merged with live server state if the player is online.

```json
→ { "cmd": "playerdata", "steamId": "76561198001234567" }
← { "data": {
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "isOnline": true,
    "location": { "x": 45.2, "y": 1.5, "z": -22.8 },
    "permissionLevel": "client",
    "health": 87.5,
    "maxHealth": 100.0,
    "hunger": 64.2,
    "thirst": 71.0,
    "temperature": 18.5,
    "wellness": 82.3,
    "xp": 14350,
    "activeEffects": [
      { "stat": "Warmth", "remainingSeconds": 120, "amount": 25 }
    ],
    "lastSeen": "2026-03-01T14:20:00.000Z"
  }}
```

---

### `playerparty`

```json
→ { "cmd": "playerparty", "steamId": "76561198001234567" }
← { "data": {
    "steamId": "76561198001234567",
    "party": {
      "partyId": "party-abc-123",
      "leaderSteamId": "76561198001234567",
      "members": [
        { "steamId": "76561198001234567", "displayName": "CoolPlayer", "isOnline": true },
        { "steamId": "76561198007654321", "displayName": "FriendPlayer", "isOnline": false }
      ]
    }
  }}
```

`party` is `null` if the player is not in a party.

---

### `playerinv`

```json
→ { "cmd": "playerinv", "steamId": "76561198001234567" }
← { "data": {
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "inventory": [
      { "slot": 0, "itemId": "rifle_bolt", "name": "Bolt-Action Rifle",
        "quantity": 1, "quality": "medium", "durability": 0.85 },
      { "slot": 1, "itemId": "ammo_762", "name": "7.62mm Ammo",
        "quantity": 120, "quality": null, "durability": null }
    ]
  }}
```

---

### `getplayers`

```json
→ { "cmd": "getplayers" }
← { "data": {
    "count": 2,
    "players": [
      { "steamId": "76561198001234567", "displayName": "CoolPlayer",
        "location": { "x": 45, "y": 1, "z": -22 },
        "permissionLevel": "admin", "ping": 24,
        "connectedAt": "2026-03-01T13:00:00.000Z" },
      { "steamId": "76561198007654321", "displayName": "FriendPlayer",
        "location": { "x": 0, "y": 0, "z": 0 },
        "permissionLevel": "client", "ping": 88,
        "connectedAt": "2026-03-01T14:15:00.000Z" }
    ]
  }}
```

---

### `addeffect` / `removeeffect` / `cleareffects`

```json
// Apply a warming effect for 5 minutes
→ { "cmd": "addeffect", "steamId": "76561198001234567",
    "stat": "Warmth", "duration": 300, "amount": 50 }
← { "data": { "steamId": "76561198001234567", "stat": "Warmth",
    "duration": 300, "amount": 50 } }

→ { "cmd": "removeeffect", "steamId": "76561198001234567", "stat": "Warmth" }
→ { "cmd": "cleareffects", "steamId": "76561198001234567" }
```

Stat names: see `getstatuseffects`.

---

### `announcement`

Broadcasts a notification bar message to all online players.

```json
→ { "cmd": "announcement", "message": "Server restarting in 10 minutes." }
← { "data": { "message": "Server restarting in 10 minutes.", "deliveredTo": 14 } }
```

---

### Arena: `setkit` / `setkitall` / `setkitquality`

```json
→ { "cmd": "setkit", "steamId": "76561198001234567", "kitName": "sniper" }
→ { "cmd": "setkitall", "kitName": "assault" }
→ { "cmd": "setkitquality", "quality": "medium" }
```

Quality levels: `poor`, `low`, `medium`, `full`

---

## 5. Events — Quick Reference

Events are pushed by the server with no prior request. Always ignore unknown `event.name` values — new events will be added in future versions.

### Player Events

| `name` | Description |
|--------|-------------|
| `player.join` | Player connected to server |
| `player.leave` | Player disconnected (includes reason) |
| `player.death` | Player died (includes killer if PvP) |
| `player.chat` | Player sent a chat message |
| `player.ban` | Player was banned |
| `player.kick` | Player was kicked |
| `player.permission.change` | A player's permission level was changed |

### Server Events

| `name` | Description |
|--------|-------------|
| `server.save` | Server completed a save (auto or manual) |
| `server.restart` | Server is about to restart (countdown included) |
| `server.start` | Server has fully started |
| `server.shutdown` | Server is shutting down |
| `server.setting.change` | A server setting was changed |

### Wipe Events

| `name` | Description |
|--------|-------------|
| `wipe.start` | A wipe operation began |
| `wipe.complete` | A wipe operation finished |

### World Events

| `name` | Description |
|--------|-------------|
| `world.loot.respawn` | Loot respawned across the map |
| `world.day.change` | Server crossed midnight (new day) |
| `world.weather.change` | Weather state changed |

### Arena Events

| `name` | Description |
|--------|-------------|
| `arena.match.start` | Arena match began |
| `arena.match.end` | Arena match ended (includes scores) |
| `arena.player.respawn` | A player respawned during a match |

---

## 6. Event Details

### `player.join`

```json
{
  "type": "event",
  "timestamp": "2026-03-01T14:33:00.000Z",
  "event": {
    "name": "player.join",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer"
  }
}
```

---

### `player.leave`

```json
{
  "event": {
    "name": "player.leave",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "reason": "disconnect"
  }
}
```

`reason` values: `disconnect`, `kick`, `ban`, `timeout`, `error`

---

### `player.death`

```json
// Killed by another player
{
  "event": {
    "name": "player.death",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "location": { "x": 45, "y": 1, "z": -22 },
    "cause": "Gunshot",
    "killerSteamId": "76561198007654321",
    "killerDisplayName": "FriendPlayer",
    "weapon": "Bolt-Action Rifle"
  }
}

// Environmental death
{
  "event": {
    "name": "player.death",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "location": { "x": 0, "y": -50, "z": 0 },
    "cause": "Drowning"
  }
}
```

`killerSteamId`, `killerDisplayName`, and `weapon` are omitted when the death was not caused by another player.

---

### `player.chat`

```json
{
  "event": {
    "name": "player.chat",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "message": "anyone got food?",
    "channel": "global"
  }
}
```

`channel` values: `global`, `team`, `local`

---

### `player.permission.change`

```json
{
  "event": {
    "name": "player.permission.change",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "previous": null,
    "current": "admin",
    "changedBy": "rcon"
  }
}
```

`previous` is `null` when permissions are newly granted. `current` is `null` when revoked via `removepermissions`.

---

### `server.restart`

```json
{
  "event": {
    "name": "server.restart",
    "reason": "Scheduled weekly restart",
    "countdownSeconds": 300
  }
}
```

Emit this event at the start of a countdown. Clients can display a warning. The server should follow up with `server.shutdown` when it actually closes.

---

### `wipe.start` / `wipe.complete`

```json
{ "event": { "name": "wipe.start", "type": "full", "initiatedBy": "rcon" } }
{ "event": { "name": "wipe.complete", "type": "full", "durationMs": 760 } }
```

---

### `arena.match.end`

```json
{
  "event": {
    "name": "arena.match.end",
    "matchId": "match-20260301-001",
    "winnerTeam": 1,
    "durationSeconds": 432,
    "scores": { "1": 5, "2": 2 }
  }
}
```

`winnerTeam` is `null` for a draw.

---

## 7. Player Data Schema

### `PlayerRecord` (returned by `playerdata`)

| Field | Type | Description |
|-------|------|-------------|
| `steamId` | `string` | 17-digit Steam ID64 |
| `displayName` | `string` | In-game display name |
| `isOnline` | `boolean` | Whether currently connected |
| `location` | `Vec3 \| null` | World position; null if offline |
| `permissionLevel` | `string` | `server`, `admin`, `operator`, or `client` |
| `health` | `number` | Current HP |
| `maxHealth` | `number` | Max HP (affected by wellness) |
| `hunger` | `number` | 0.0 (starving) – 100.0 (full) |
| `thirst` | `number` | 0.0 (dehydrated) – 100.0 (hydrated) |
| `temperature` | `number` | Celsius |
| `wellness` | `number` | Wellness stat (0–100+) |
| `xp` | `number` | Total accumulated XP |
| `activeEffects` | `array` | Currently active status effects |
| `lastSeen` | `string \| null` | ISO 8601 timestamp of last connection |

### `InventoryItem` (inside `playerinv`)

| Field | Type | Description |
|-------|------|-------------|
| `slot` | `number` | Inventory slot index (0-based) |
| `itemId` | `string` | Internal item identifier |
| `name` | `string` | Display name |
| `quantity` | `number` | Stack size |
| `quality` | `string \| null` | `poor`, `low`, `medium`, `full`, or null |
| `durability` | `number \| null` | 0.0–1.0, or null if item has no durability |

### `PlayerParty` (inside `playerparty`)

| Field | Type | Description |
|-------|------|-------------|
| `partyId` | `string` | Unique party identifier |
| `leaderSteamId` | `string` | Steam ID of the party leader |
| `members` | `array` | Each member: `steamId`, `displayName`, `isOnline` |

---

## 8. Error Codes

| Code | HTTP equiv | Meaning |
|------|------------|---------|
| `NOT_AUTHENTICATED` | 401 | Command sent before `auth_ok` |
| `INSUFFICIENT_PERMISSION` | 403 | Caller's level below minimum required |
| `UNKNOWN_COMMAND` | 404 | `cmd` value not recognised |
| `INVALID_ARGS` | 400 | Missing required field or value out of range |
| `PLAYER_NOT_FOUND` | 404 | SteamId not found in any data store |
| `PLAYER_NOT_ONLINE` | 409 | Player exists but is not currently connected |
| `ENTITY_NOT_FOUND` | 404 | entityId not found in world |
| `SETTING_NOT_FOUND` | 404 | serversetting key not recognised |
| `WIPE_IN_PROGRESS` | 409 | Concurrent wipe not permitted |
| `ARENA_NOT_ACTIVE` | 409 | Arena command used outside arena mode |
| `INVALID_KIT` | 404 | Kit name not found |
| `INTERNAL_ERROR` | 500 | Unhandled server-side failure |

---

## 9. Implementation Notes

### For the game server (implementing the server side)

- Listen on `rconPort` from `serversettings.json` (suggest default `28016`).
- Accept multiple concurrent WebSocket connections. Each authenticates independently.
- All commands must complete and return a `result` within 30 seconds. Timeout with `INTERNAL_ERROR` if not.
- Emit all events to **all** authenticated RCON connections simultaneously.
- Unknown command names must return `UNKNOWN_COMMAND`, never crash.
- Implement the `ping`/`pong` keepalive. Close idle connections after 90 seconds with no ping.
- The `wipe` command should emit `wipe.start` before beginning and `wipe.complete` after — treat it as a fire-and-forget with events tracking progress.

### For the dashboard (consuming the protocol)

- Use a single persistent WebSocket connection per server; reconnect with exponential backoff on close.
- Generate a UUID or monotonic counter for `command.id`. Track pending requests in a `Map<id, resolver>`.
- Register handlers for event `name` values. Ignore unknown names — do not throw.
- Re-authenticate on reconnect (send `auth` again after the new connection opens).
- The `rcon-adapter.ts` service in `apps/api/src/services/` is the integration point. `WebSocketRconAdapter` is the stub to fill in.

### Protocol versioning

The `auth_ok` message includes a `version` field. If the server returns a version the dashboard does not support, log a warning but continue — the command/event sets are designed to be backwards-compatible.
Breaking changes increment the major version (e.g. `2.0.0`) and will require a coordinated update.

### Wipe command — agreed additions

The following commands do not exist in the current game console but have been agreed with the game developer as part of the RCON implementation:

- `wipe map` — map-only wipe
- `wipe playerdata` — all player data wipe
- `wipe playerdata <steamId>` — single-player data wipe
- `wipe full` — full server wipe

### New player data commands

The following are also agreed additions that will be exposed exclusively over RCON (not the in-game console):

- `playerdata <steamId>` — full player record
- `playerparty <steamId>` — party membership
- `playerinv <steamId>` — full inventory