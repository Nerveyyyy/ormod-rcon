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
3. [Command Details](#3-command-details)
4. [Events — Quick Reference](#4-events--quick-reference)
5. [Event Details](#5-event-details)
6. [Player Data Schema](#6-player-data-schema)
7. [Error Codes](#7-error-codes)
8. [Implementation Notes](#8-implementation-notes)

### Ship tags

Every command and event in this document is tagged with a shipping tier so
the game developer can prioritise. Untagged items are still to be decided.

| Tag | Meaning |
|-----|---------|
| **MVP** | Must ship in the initial RCON release — dashboard is blocked without it |
| **NTH** | Nice to have — valuable but not blocking |
| **post-launch** | Ships after the core RCON (e.g. arena mode) |

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

Send a `ping` every 30 seconds. If no `pong` is received within 10 seconds, treat the connection as dead.

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

Every command is a JSON object with:

- `type` — always `"command"`
- `id` — any unique string chosen by the client. The server echoes it back in the `result` so you can match responses to requests even when multiple commands are in-flight.
- `cmd` — the command name (e.g. `"kick"`, `"ban"`, `"spawn"`)
- `data` — object containing any parameters the command needs. **Optional** — omit it entirely for commands that take no parameters (e.g. `getplayers`, `forcesave`).

This mirrors the `result` envelope, which also uses `data` for its payload.

```json
// Command with parameters
{
  "type": "command",
  "id": "req-001",
  "cmd": "kick",
  "data": {
    "steamId": "76561198001234567"
  }
}

// Command with no parameters — data omitted
{
  "type": "command",
  "id": "req-002",
  "cmd": "getplayers"
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

## 3. Command Details

This section documents only the commands whose **return payload** are a bit more complex.

I have not added commands that are basic or simple with the return values.

Every heading below is annotated with its ship tag so specific events/commands are added with the biggest affect.

### `setserversetting` — **MVP**

Changes one field in `serversettings.json`. The file hot-reloads — no restart needed.
The dashboard only needs the new value echoed back (not the prior value).

```json
→ { "type": "command", "id": "1", "cmd": "setserversetting", "data": {
    "setting": "MaxPlayers",
    "value": 32
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "setting": "MaxPlayers",
    "value": 32
  }}
```

---

### `wipe` — **NTH**

**Type `map`** — Deletes world geometry data. Player inventories, skills, and XP survive.
**Type `playerdata`** — Deletes `PlayerData/<steamId>.json` files. World stays intact.
**Type `full`** — Both map and all player data.

```json
// Wipe the map only
→ { "type": "command", "id": "1", "cmd": "wipe", "data": {
    "type": "map"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "type": "map",
    "durationMs": 340
  }}

// Wipe one player's data
→ { "type": "command", "id": "1", "cmd": "wipe", "data": {
    "type": "playerdata",
    "steamId": "76561198001234567"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "type": "playerdata",
    "steamId": "76561198001234567",
    "durationMs": 340
  }}

// Full server wipe
→ { "type": "command", "id": "1", "cmd": "wipe", "data": {
    "type": "full"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "type": "full",
    "durationMs": 340
  }}
```

`steamId` is only valid when `type` is `"playerdata"`. Providing it with `"map"` or `"full"` returns `INVALID_ARGS`.

---

### `spawn` — **NTH**

Spawn priority: coordinates > steamId position > server error (RCON has no implicit position).

```json
// At a player's location
→ { "type": "command", "id": "1", "cmd": "spawn", "data": {
    "entity": "Bear",
    "steamId": "76561198001234567"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "entity": "Bear",
    "location": { "x": 120.5, "y": 0.0, "z": -44.2 }
  }}

// At exact coordinates
→ { "type": "command", "id": "1", "cmd": "spawn", "data": {
    "entity": "IronOre",
    "x": 100, "y": 0, "z": 200
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "entity": "IronOre",
    "location": { "x": 100, "y": 0, "z": 200 }
  }}
```

Entity names: see `getentities`, `getenemies`, `getworkbenches`, `getvehicles`.

---

### `teleport` — **NTH**

Exactly one destination must be provided: either `toSteamId` or all three of `x`, `y`, `z`.
The result echoes both `from` and `to` so the dashboard can log the movement cleanly.

```json
// Move player to another player
→ { "type": "command", "id": "1", "cmd": "teleport", "data": {
    "steamId": "76561198001234567",
    "toSteamId": "76561198007654321"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "steamId": "76561198001234567",
    "from": { "x": 0, "y": 0, "z": 0 },
    "to":   { "x": 55, "y": 2, "z": -10 }
  }}

// Move player to coordinates
→ { "type": "command", "id": "1", "cmd": "teleport", "data": {
    "steamId": "76561198001234567",
    "x": 0, "y": 0, "z": 0
  }}
```

---

### `playerdata` — **MVP**

Returns full stored data for any player, online or offline. This is a read of the `PlayerData/<steamId>.json` file merged with live server state if the player is online.

```json
→ { "type": "command", "id": "1", "cmd": "playerdata", "data": {
    "steamId": "76561198001234567"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "isOnline": true,
    "location": { "x": 45.2, "y": 1.5, "z": -22.8 },
    "health": 87.5,
    "maxHealth": 100.0,
    "hunger": 64.2,
    "thirst": 71.0,
    "temperature": 18.5,
    "wellness": 82.3,
    "xp": 14350,
    "activeEffects": [
      { "stat": "Warmth", "remainingSeconds": 120, "amount": 25 }
    ]
  }}
```

---

### `playerparty` — **NTH**

```json
→ { "type": "command", "id": "1", "cmd": "playerparty", "data": {
    "steamId": "76561198001234567"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
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

### `playerinv` — **NTH**

```json
→ { "type": "command", "id": "1", "cmd": "playerinv", "data": {
    "steamId": "76561198001234567"
  }}
← { "type": "result", "id": "1", "success": true, "data": {
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

### `getplayers` — **MVP**

```json
→ { "type": "command", "id": "1", "cmd": "getplayers" }
← { "type": "result", "id": "1", "success": true, "data": {
    "count": 2,
    "players": [
      { "steamId": "76561198001234567", "displayName": "CoolPlayer" },
      { "steamId": "76561198007654321", "displayName": "FriendPlayer" }
    ]
  }}
```

---

### `getbans` — **NTH**

Returns the full contents of `banlist.txt`.

```json
→ { "type": "command", "id": "1", "cmd": "getbans" }
← { "type": "result", "id": "1", "success": true, "data": {
    "bans": [
      { "steamId": "76561198001234567", "reason": "cheating" },
      { "steamId": "76561198009876543" }
    ]
  }}
```

`reason` is omitted when the ban was recorded without one.

---

### `getwhitelist` — **NTH**

Returns the full contents of `whitelist.txt`.

```json
→ { "type": "command", "id": "1", "cmd": "getwhitelist" }
← { "type": "result", "id": "1", "success": true, "data": {
    "whitelist": [
      "76561198001234567",
      "76561198007654321",
      "76561198009999999"
    ]
  }}
```

---

### `getadmins` — **NTH**

Returns the full contents of `adminlist.txt` parsed into `{ steamId, level }` entries.

```json
→ { "type": "command", "id": "1", "cmd": "getadmins" }
← { "type": "result", "id": "1", "success": true, "data": {
    "admins": [
      { "steamId": "76561198000000001", "level": "admin" },
      { "steamId": "76561198000000002", "level": "operator" }
    ]
  }}
```

---

### `serverstatus` — **MVP**

Single source of truth for live server metadata. The dashboard calls this on
connect and polls on a low cadence (or on reconnect) to keep the status panel
fresh.

```json
→ { "type": "command", "id": "1", "cmd": "serverstatus" }
← { "type": "result", "id": "1", "success": true, "data": {
    "serverName": "My Server",
    "gameVersion": "0.8.2",
    "rconProtocolVersion": "1.0.0",
    "ip": "203.0.113.42",
    "port": 27015,
    "startedAt": "2026-02-28T03:00:00.000Z",
    "maxPlayers": 32,
    "seed": "7421893",
    "saveIntervalSeconds": 300
  }}
```

---

### `serverperformance` — **MVP**

On-demand performance snapshot. Sampling tick rate / memory / frame time can be expensive, so the
dashboard decides when to take the hit.

```json
→ { "type": "command", "id": "1", "cmd": "serverperformance" }
← { "type": "result", "id": "1", "success": true, "data": {
    "tickRateHz": 30,
    "memoryMb": 4120,
    "avgFrameMs": 32.4,
    "sampledAt": "2026-03-01T14:35:00.000Z"
  }}
```

---

### `privatemessage` — **NTH**

Private message to a single player.

```json
→ { "type": "command", "id": "1", "cmd": "privatemessage", "data": {
    "steamId": "76561198001234567",
    "message": "Please stop camping the spawn."
  }}
← { "type": "result", "id": "1", "success": true, "data": {
    "steamId": "76561198001234567",
    "delivered": true
  }}
```

return error if player is not online.

---

## 4. Events — Quick Reference

Events are pushed by the server with no prior request. Always ignore unknown `event.name` values — new events will be added in future versions.

### Anti-cheat Events

| `name` | Ship | Description |
|--------|------|-------------|
| `anticheat.alert` | MVP | Anti-cheat flagged suspicious behaviour |

### Player Events

| `name` | Ship | Description |
|--------|------|-------------|
| `player.join` | MVP  | Player connected to server |
| `player.leave` | MVP  | Player disconnected (includes reason) |
| `player.death` | MVP  | Player died (includes killer if PvP) |
| `player.chat` | NTH  | Player sent a chat message |
| `player.ban` | NTH  | Player was banned |
| `player.kick` | NTH  | Player was kicked |
| `player.permission.change` | NTH  | A player's permission level was changed |

### Server Events

| `name` | Ship | Description |
|--------|------|-------------|
| `server.save` | — | Server completed a save (auto or manual) |
| `server.restart` | — | Server is about to restart (countdown included) |
| `server.start` | — | Server has fully started |
| `server.shutdown` | — | Server is shutting down |
| `server.setting.change` | — | A server setting was changed |
| `server.command.executed` | — | A command was run (via RCON or in-game console) |

### Wipe Events

| `name` | Ship | Description |
|--------|------|-------------|
| `wipe.start` | — | A wipe operation began |
| `wipe.complete` | — | A wipe operation finished |

### World Events

| `name` | Ship | Description |
|--------|------|-------------|
| `world.loot.respawn` | — | Loot respawned across the map |
| `world.day.change` | — | Server crossed midnight (new day) |
| `world.weather.change` | — | Weather state changed |

### Arena Events

All arena events ship **post-launch** alongside the arena commands.

| `name` | Description |
|--------|-------------|
| `arena.match.start` | Arena match began |
| `arena.match.end` | Arena match ended (includes scores) |
| `arena.player.respawn` | A player respawned during a match |

### Nice-to-have Events

Non-blocking but valuable additions?

| `name` | Ship | Description |
|--------|------|-------------|
| `player.connect.rejected` | NTH | A connection attempt failed before auth completed |
| `player.party.change` | NTH | A player joined, left, or disbanded a party |

---

## 5. Event Details

### `player.join`

```json
{
  "type": "event",
  "timestamp": "2026-03-01T14:33:00.000Z",
  "event": {
    "name": "player.join",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "ip": "203.0.113.77"
  }
}
```

`ip` is the player's public IP as observed at connect time.

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

Dashboard joins `victim.steamId` and `killer.steamId` against its own player
records for display names — names are not duplicated into this event.

`source` values:

| Value | Meaning |
|-------|---------|
| `suicide` | Self-inflicted (`/kill`, grenade-on-foot, etc.) |
| `environment` | Fall, drowning, starvation, thirst, temperature |
| `ai` | NPC / creature kill — see `killer.npcType` |
| `player` | PvP kill — see `killer.steamId` |

```json
// PvP kill with full hit telemetry
{
  "event": {
    "name": "player.death",
    "victim": {
      "steamId": "76561198001234567",
      "location": { "x": 45, "y": 1, "z": -22 }
    },
    "source": "player",
    "cause": "Gunshot",
    "killer": {
      "steamId": "76561198007654321",
      "location": { "x": 190, "y": 3, "z": 160 }
    },
    "weapon": {
      "itemId": "rifle_bolt",
      "name": "Bolt-Action Rifle",
      "attachments": [ "scope_4x", "suppressor" ],
      "ammoType": "ammo_762"
    },
    "hit": {
      "zone": "head",
      "headshot": true,
      "distanceMeters": 215.6
    }
  }
}

// AI kill
{
  "event": {
    "name": "player.death",
    "victim": {
      "steamId": "76561198001234567",
      "location": { "x": 120, "y": 0, "z": -44 }
    },
    "source": "ai",
    "cause": "Bear",
    "killer": { "npcType": "Bear" }
  }
}

// Environmental death
{
  "event": {
    "name": "player.death",
    "victim": {
      "steamId": "76561198001234567",
      "location": { "x": 0, "y": -50, "z": 0 }
    },
    "source": "environment",
    "cause": "Drowning"
  }
}

// Suicide
{
  "event": {
    "name": "player.death",
    "victim": {
      "steamId": "76561198001234567",
      "location": { "x": 45, "y": 1, "z": -22 }
    },
    "source": "suicide",
    "cause": "Self-inflicted"
  }
}
```

`killer`, `weapon`, and `hit` are all optional — populate whichever fields are
known at the time of the event. `hit.zone` values: `head`, `chest`, `stomach`,
`arm_left`, `arm_right`, `leg_left`, `leg_right`, `other`.

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

### `wipe.start` / `wipe.complete`

```json
{ "event": { "name": "wipe.start", "type": "full", "initiatedBy": "rcon" } }
{ "event": {
    "name": "wipe.complete",
    "type": "full",
    "durationMs": 760,
    "wipedAt": "2026-03-01T05:00:12.000Z"
  }}
```

`wipedAt` on `wipe.complete` is the canonical "last wiped at" timestamp —
the dashboard stores this value as-is. Prefer it over the envelope `timestamp`.

---

### `server.start`

```json
{
  "event": {
    "name": "server.start",
    "serverName": "My Server",
    "gameVersion": "0.8.2",
    "seed": "7421893",
    "maxPlayers": 32
  }
}
```

`gameVersion` is the game build version and is distinct from the RCON
protocol version returned in `auth_ok`.

---

### `player.ban` / `player.kick`

```json
{
  "event": {
    "name": "player.ban",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "bannedBy": "rcon",
    "reason": "cheating"
  }
}

{
  "event": {
    "name": "player.kick",
    "steamId": "76561198001234567",
    "displayName": "CoolPlayer",
    "kickedBy": "76561198000000001",
    "reason": "spawn camping"
  }
}
```

`reason` is optional on both events and is omitted when not provided.

---

### `anticheat.alert`

Fired whenever the anti-cheat subsystem flags suspicious behaviour, regardless
of whether it takes automatic action.

```json
{
  "event": {
    "name": "anticheat.alert",
    "steamId": "76561198001234567",
    "displayName": "SuspiciousPlayer",
    "location": { "x": 100, "y": 2, "z": -50 },
    "detectionType": "aimbot",
    "severity": "high",
    "details": "Angular velocity exceeded human threshold 12 times in 5s",
    "actionTaken": "kicked"
  }
}
```

`detectionType` is free-form so the anti-cheat can add new signals without a
protocol bump. Expected values include `aimbot`, `speedhack`, `teleport`,
`noclip`, `esp`, `weapon_mod`, `memory_tamper`, `unknown`.
`actionTaken` values: `none`, `warned`, `kicked`, `banned`.

---

### `server.command.executed`

Audit trail for mutating actions taken outside the dashboard UI — e.g. an admin
running `ban` from the in-game console. The dashboard still needs this to keep
its activity log consistent.

```json
{
  "event": {
    "name": "server.command.executed",
    "cmd": "ban",
    "args": { "steamId": "76561198001234567", "reason": "cheating" },
    "executedBy": "76561198000000001",
    "success": true
  }
}
```

`executedBy` is `"rcon"` when the command came in over the RCON WebSocket, or
the SteamId of the in-game admin who ran it.

---

### `player.connect.rejected` *(nice to have)*

A connection attempt failed before auth completed. Surfaces ban-dodge attempts,
whitelist misses, and capacity issues.

```json
{
  "event": {
    "name": "player.connect.rejected",
    "steamId": "76561198001234567",
    "ip": "203.0.113.77",
    "reason": "banned"
  }
}
```

`steamId` is omitted if the handshake never got far enough to identify the
player. `reason` values: `banned`, `not_whitelisted`, `server_full`,
`auth_failed`, `version_mismatch`.

---

### `player.party.change` *(nice to have)*

Live party membership change — lets the dashboard maintain party state without
polling `playerparty`.

```json
{
  "event": {
    "name": "player.party.change",
    "steamId": "76561198001234567",
    "partyId": "party-abc-123",
    "action": "joined"
  }
}
```

`action` values: `joined`, `left`, `disbanded`. `partyId` is `null` on
`disbanded` when the party no longer exists.

---

## 7. Error Codes

| Code | HTTP equiv | Meaning |
|------|------------|---------|
| `NOT_AUTHENTICATED` | 401 | Command sent before `auth_ok` |
| `UNKNOWN_COMMAND` | 404 | `cmd` value not recognised |
| `INVALID_ARGS` | 400 | Missing required field or value out of range |
| `PLAYER_NOT_FOUND` | 404 | SteamId not found in any data store |
| `PLAYER_NOT_ONLINE` | 409 | Player exists but is not currently connected |
| `ENTITY_NOT_FOUND` | 404 | entityId not found in world |
| `SETTING_NOT_FOUND` | 404 | serversetting key not recognised |
| `WIPE_IN_PROGRESS` | 409 | Concurrent wipe not permitted |
| `INVALID_KIT` | 404 | Kit name not found |
| `INTERNAL_ERROR` | 500 | Unhandled server-side failure |

---

## 8. Implementation Notes

### For the game server (implementing the server side)

- Listen on `rconPort` from `serversettings.json` (suggest default `28016`).
- Accept multiple concurrent WebSocket connections. Each authenticates independently.
- All commands must complete and return a `result` within 30 seconds. Timeout with `INTERNAL_ERROR` if not.
- Emit all events to **all** authenticated RCON connections simultaneously.
- Unknown command names must return `UNKNOWN_COMMAND`, never crash.
- Implement the `ping`/`pong` keepalive. Close idle connections after 90 seconds with no ping.
- The `wipe` command should emit `wipe.start` before beginning and `wipe.complete` after — treat it as a fire-and-forget with events tracking progress.

### Protocol versioning

The `auth_ok` message includes a `version` field. If the server returns a version the dashboard does not support, log a warning but continue — the command/event sets are designed to be backwards-compatible.
Breaking changes increment the major version (e.g. `2.0.0`) and will require a coordinated update.

### New player data commands

The following are also agreed additions that will be exposed over RCON & game console:

- `playerdata <steamId>` — full player record
- `playerparty <steamId>` — party membership
- `playerinv <steamId>` — full inventory
