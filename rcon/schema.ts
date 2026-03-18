/**
 * ORMOD: Directive — RCON Protocol Schema
 * ========================================
 * Version: 1.0.0
 *
 * WebSocket-based, JSON-framed, request/response + server-push event protocol.
 * This file is the ground-truth type contract between the dashboard and the game server.
 * The game developer should implement the server side to match these types exactly.
 *
 * Transport:  WebSocket (ws:// or wss://)
 * Encoding:   UTF-8 JSON
 * Frame size: max 65 535 bytes per message
 * Port:       configurable — default 28016 (set in serversettings.json)
 */

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION LEVELS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the in-game hierarchy. Commands list the minimum level required.
 * An RCON connection itself holds [server]-level authority unless restricted.
 */
export type PermissionLevel = 'server' | 'admin' | 'operator' | 'client'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/** A 17-digit Steam ID64 string. */
export type SteamId = string

/** XYZ world coordinates. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** ISO 8601 date-time string (e.g. "2026-03-01T14:32:00.000Z"). */
export type ISOTimestamp = string

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE ENVELOPE
// ─────────────────────────────────────────────────────────────────────────────

export type MessageType =
  | 'auth'
  | 'auth_ok'
  | 'auth_error'
  | 'command'
  | 'result'
  | 'event'
  | 'ping'
  | 'pong'

export interface BaseMessage {
  type: MessageType
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION  (must complete before any command is accepted)
// ─────────────────────────────────────────────────────────────────────────────

/** Client → Server: send this immediately after the WS connection opens. */
export interface AuthMessage extends BaseMessage {
  type: 'auth'
  /** The RCON secret configured in serversettings.json (rconPassword). */
  secret: string
}

/** Server → Client: authentication succeeded. */
export interface AuthOkMessage extends BaseMessage {
  type: 'auth_ok'
  /** Current server time. */
  serverTime: ISOTimestamp
  /** Value of the ServerName setting. */
  serverName: string
  /** RCON protocol version implemented by the server. */
  version: '1.0.0'
}

/** Server → Client: authentication failed — close the socket after receiving this. */
export interface AuthErrorMessage extends BaseMessage {
  type: 'auth_error'
  reason: 'invalid_secret' | 'already_authenticated' | 'max_connections'
}

// ─────────────────────────────────────────────────────────────────────────────
// KEEPALIVE
// ─────────────────────────────────────────────────────────────────────────────

/** Client → Server: keepalive. Server must reply with pong within 10 s. */
export interface PingMessage extends BaseMessage {
  type: 'ping'
}

/** Server → Client: response to ping. */
export interface PongMessage extends BaseMessage {
  type: 'pong'
  /** Echoes back the server time so the client can measure round-trip latency. */
  serverTime: ISOTimestamp
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND REQUEST  (Client → Server)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper for all commands sent to the server.
 * The `id` field is echoed in the matching `result` message so the client
 * can correlate responses even when multiple commands are in-flight.
 *
 * @example
 * { "type": "command", "id": "a1b2", "command": { "cmd": "kick", "steamId": "76561198001234567" } }
 */
export interface CommandMessage extends BaseMessage {
  type: 'command'
  /** Client-generated correlation ID — any unique string (UUID, counter, etc.). */
  id: string
  command: Command
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND RESULT  (Server → Client)
// ─────────────────────────────────────────────────────────────────────────────

/** Server → Client: command executed successfully. */
export interface ResultOk<T = unknown> extends BaseMessage {
  type: 'result'
  /** Echoes the `id` from the matching CommandMessage. */
  id: string
  success: true
  data: T
}

/** Server → Client: command failed. */
export interface ResultError extends BaseMessage {
  type: 'result'
  id: string
  success: false
  error: {
    code: ErrorCode
    /** Human-readable description — do not parse programmatically. */
    message: string
  }
}

export type Result<T = unknown> = ResultOk<T> | ResultError

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CODES
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'NOT_AUTHENTICATED'        // Command sent before auth_ok
  | 'INSUFFICIENT_PERMISSION'  // Caller's permission level too low
  | 'UNKNOWN_COMMAND'          // Command name not recognised
  | 'INVALID_ARGS'             // Arguments failed validation
  | 'PLAYER_NOT_FOUND'         // SteamId does not exist in any data store
  | 'PLAYER_NOT_ONLINE'        // SteamId known but player not currently online
  | 'ENTITY_NOT_FOUND'         // entityId does not exist in the world
  | 'SETTING_NOT_FOUND'        // serversetting key not recognised
  | 'WIPE_IN_PROGRESS'         // Another wipe operation is already running
  | 'ARENA_NOT_ACTIVE'         // Arena command used while not in arena mode
  | 'INVALID_KIT'              // Kit name not found
  | 'INTERNAL_ERROR'           // Unhandled server-side failure

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDS  (discriminated by `cmd`)
// ─────────────────────────────────────────────────────────────────────────────
// Organised by minimum permission level required.
// Commands marked [server] can only be issued by holders of [server] permission.

// ── [server] ─────────────────────────────────────────────────────────────────

/**
 * Modify a single serversettings.json field.
 * [server]
 * @example { cmd: "setserversetting", setting: "MaxPlayers", value: 32 }
 */
export interface SetServerSettingCommand {
  cmd: 'setserversetting'
  /** Setting key exactly as it appears in serversettings.json. */
  setting: string
  /** New value — string, number, or boolean depending on the setting. */
  value: string | number | boolean
}

/**
 * Grant a permission level to a player.
 * Writes to adminlist.txt.
 * [server]
 */
export interface SetPermissionsCommand {
  cmd: 'setpermissions'
  steamId: SteamId
  level: PermissionLevel
}

/**
 * Revoke all permissions from a player.
 * Removes from adminlist.txt.
 * [server]
 */
export interface RemovePermissionsCommand {
  cmd: 'removepermissions'
  steamId: SteamId
}

/**
 * Enable or disable server-side authentication.
 * [server]
 */
export interface AuthEnabledCommand {
  cmd: 'authenabled'
  enabled: boolean
}

/**
 * Enable or disable the anti-cheat system.
 * [server]
 */
export interface AntiCheatEnabledCommand {
  cmd: 'anticheatenabled'
  enabled: boolean
}

/**
 * Trigger an immediate server save (writes all data to disk).
 * [server]
 */
export interface ForceSaveCommand {
  cmd: 'forcesave'
}

/**
 * Wipe server data.
 * Agreed addition — not yet in game; reserved for RCON implementation.
 * [server]
 *
 * - type "map"        → deletes RegionData + mapdata + structuredata + entitydata.
 *                       Player data (inventory, skills, XP) is preserved.
 * - type "playerdata" → deletes all PlayerData JSON files.
 *                       If steamId is provided, only that player's file is deleted.
 * - type "full"       → equivalent to map + playerdata combined.
 */
export interface WipeCommand {
  cmd: 'wipe'
  type: 'map' | 'playerdata' | 'full'
  /**
   * Only valid when type === "playerdata".
   * If omitted, ALL player data files are wiped.
   */
  steamId?: SteamId
}

// ── [admin] ──────────────────────────────────────────────────────────────────

/**
 * Spawn an entity.
 * Location priority: coords > steamId > invoker position (no RCON position — steamId recommended).
 * [admin]
 * @example { cmd: "spawn", entity: "Bear", steamId: "76561198001234567" }
 * @example { cmd: "spawn", entity: "IronOre", x: 100, y: 0, z: 200 }
 */
export interface SpawnCommand {
  cmd: 'spawn'
  /** Entity name as listed by `getentities`, `getenemies`, etc. */
  entity: string
  /** Spawn at this player's location. */
  steamId?: SteamId
  /** Spawn at exact world coordinates. Requires x, y, and z together. */
  x?: number
  y?: number
  z?: number
}

/**
 * Modify a property on a world entity.
 * [admin]
 */
export interface SetDataCommand {
  cmd: 'setdata'
  entityId: string
  key: string
  value: string | number | boolean
}

/**
 * Toggle noclip (no collision) for a player.
 * [admin]
 */
export interface NoclipCommand {
  cmd: 'noclip'
  steamId: SteamId
  enabled: boolean
}

/**
 * Toggle god mode (invulnerability) for a player.
 * [admin]
 */
export interface GodModeCommand {
  cmd: 'godmode'
  steamId: SteamId
  enabled: boolean
}

/**
 * Toggle spectator mode for a player.
 * [admin]
 */
export interface SpectatorCommand {
  cmd: 'spectator'
  steamId: SteamId
  enabled: boolean
}

/**
 * Show bullet trajectory tracers server-wide.
 * [admin]
 */
export interface EnableTracersCommand {
  cmd: 'enabletracers'
  enabled: boolean
}

/**
 * Force all loot to respawn immediately.
 * [admin]
 */
export interface ForceRespawnLootCommand {
  cmd: 'forcerespawnloot'
}

/**
 * Read all current serversettings.json values.
 * [admin]
 */
export interface GetServerSettingsCommand {
  cmd: 'getserversettings'
}

/**
 * Set the server time of day.
 * [admin]
 * @example { cmd: "settime", time: 1200 }  // noon
 */
export interface SetTimeCommand {
  cmd: 'settime'
  /** 0–2400 (military time format). */
  time: number
}

export type WeatherType = 'cloudy' | 'stormy' | 'overcast' | 'sparse' | 'clear' | 'lightningstorm' | 'lightrain'

/**
 * Set the weather state.
 * [admin]
 */
export interface SetWeatherCommand {
  cmd: 'setweather'
  weather: WeatherType
}

/**
 * Toggle global fog.
 * [admin]
 */
export interface SetFogCommand {
  cmd: 'setfog'
  enabled: boolean
}

/**
 * Enable or disable the ammo-consumption requirement.
 * [admin]
 */
export interface SetAmmoCommand {
  cmd: 'setammo'
  enabled: boolean
}

/**
 * Teleport a player.
 * Exactly one destination variant must be provided.
 * [admin]
 * @example { cmd: "teleport", steamId: "...", toSteamId: "..." }   // to another player
 * @example { cmd: "teleport", steamId: "...", x: 0, y: 0, z: 0 }  // to coordinates
 */
export interface TeleportCommand {
  cmd: 'teleport'
  /** The player to move. */
  steamId: SteamId
  /** Teleport to this player's current location. */
  toSteamId?: SteamId
  /** Teleport to exact coordinates. Requires x, y, and z together. */
  x?: number
  y?: number
  z?: number
}

/**
 * Permanently ban a player (adds to banlist.txt).
 * [admin]
 */
export interface BanCommand {
  cmd: 'ban'
  steamId: SteamId
}

/**
 * Remove a ban (removes from banlist.txt).
 * [admin]
 */
export interface UnbanCommand {
  cmd: 'unban'
  steamId: SteamId
}

/**
 * Add a player to whitelist.txt.
 * [admin]
 */
export interface WhitelistCommand {
  cmd: 'whitelist'
  steamId: SteamId
}

/**
 * Remove a player from whitelist.txt.
 * [admin]
 */
export interface RemoveWhitelistCommand {
  cmd: 'removewhitelist'
  steamId: SteamId
}

/**
 * Kill a specific player.
 * [admin]
 */
export interface KillPlayerCommand {
  cmd: 'kill'
  steamId: SteamId
}

/**
 * Kill all online players.
 * [admin]
 */
export interface KillAllCommand {
  cmd: 'killall'
}

// ── [operator] ────────────────────────────────────────────────────────────────

/**
 * Get info about the entity the requesting player is looking at.
 * Not useful in RCON context — included for completeness.
 * [operator]
 */
export interface GetEntityCommand {
  cmd: 'getentity'
}

/**
 * Get the biome at the requesting player's location.
 * Not useful in RCON context — included for completeness.
 * [operator]
 */
export interface GetBiomeCommand {
  cmd: 'getbiome'
}

/**
 * List all currently connected players.
 * [operator]
 */
export interface GetPlayersCommand {
  cmd: 'getplayers'
}

/**
 * Get the world seed and server location metadata.
 * [operator]
 */
export interface SeedCommand {
  cmd: 'seed'
}

/**
 * Get current world coordinates.
 * Not useful in RCON context — included for completeness.
 * [operator]
 */
export interface GetLocationCommand {
  cmd: 'getlocation'
}

/**
 * Retrieve all stored data for a player (online or offline).
 * Returns health, hunger, thirst, temperature, wellness, skills, and more.
 * Agreed addition — reserved for RCON implementation.
 * [operator]
 */
export interface PlayerDataCommand {
  cmd: 'playerdata'
  steamId: SteamId
}

/**
 * Retrieve a player's current party membership.
 * Agreed addition — reserved for RCON implementation.
 * [operator]
 */
export interface PlayerPartyCommand {
  cmd: 'playerparty'
  steamId: SteamId
}

/**
 * Retrieve a player's full inventory.
 * Agreed addition — reserved for RCON implementation.
 * [operator]
 */
export interface PlayerInvCommand {
  cmd: 'playerinv'
  steamId: SteamId
}

/**
 * Grant experience points to a player.
 * [operator]
 */
export interface AddXpCommand {
  cmd: 'addxp'
  steamId: SteamId
  amount: number
}

/**
 * Apply a status effect to a player.
 * [operator]
 */
export interface AddEffectCommand {
  cmd: 'addeffect'
  steamId: SteamId
  /** Stat name as listed by `getstatuseffects`. */
  stat: string
  /** Duration in seconds. */
  duration: number
  /** Magnitude of the effect. */
  amount: number
}

/**
 * Remove a specific status effect from a player.
 * [operator]
 */
export interface RemoveEffectCommand {
  cmd: 'removeeffect'
  steamId: SteamId
  stat: string
}

/**
 * Remove all active status effects from a player.
 * [operator]
 */
export interface ClearEffectsCommand {
  cmd: 'cleareffects'
  steamId: SteamId
}

/**
 * Unlock all skill tree nodes for a player.
 * [operator]
 */
export interface UnlockAllSkillsCommand {
  cmd: 'unlockallskills'
  steamId: SteamId
}

/**
 * Unlock all crafting blueprints for a player.
 * [operator]
 */
export interface UnlockAllBlueprintsCommand {
  cmd: 'unlockallblueprints'
  steamId: SteamId
}

/**
 * Restore a player to full health.
 * [operator]
 */
export interface HealCommand {
  cmd: 'heal'
  steamId: SteamId
}

/**
 * Broadcast a server announcement to all players.
 * [operator]
 */
export interface AnnouncementCommand {
  cmd: 'announcement'
  message: string
}

/**
 * Remove a player from the server (no ban).
 * [operator]
 */
export interface KickCommand {
  cmd: 'kick'
  steamId: SteamId
}

// ── [client] ─────────────────────────────────────────────────────────────────

/**
 * Get the current in-game time.
 * [client]
 */
export interface GetTimeCommand {
  cmd: 'gettime'
}

/**
 * List all spawnable entity names.
 * [client]
 */
export interface GetEntitiesCommand {
  cmd: 'getentities'
}

/**
 * List all workbench names.
 * [client]
 */
export interface GetWorkbenchesCommand {
  cmd: 'getworkbenches'
}

/**
 * List all vehicle names.
 * [client]
 */
export interface GetVehiclesCommand {
  cmd: 'getvehicles'
}

/**
 * List all enemy/creature names.
 * [client]
 */
export interface GetEnemiesCommand {
  cmd: 'getenemies'
}

/**
 * List all available status effect names.
 * [client]
 */
export interface GetStatusEffectsCommand {
  cmd: 'getstatuseffects'
}

// ── [admin] Arena ─────────────────────────────────────────────────────────────

/**
 * Assign a loadout kit to a specific player.
 * [admin] in arena mode
 */
export interface SetKitCommand {
  cmd: 'setkit'
  steamId: SteamId
  kitName: string
}

/**
 * Assign a loadout kit to all participants.
 * [admin] in arena mode
 */
export interface SetKitAllCommand {
  cmd: 'setkitall'
  kitName: string
}

/**
 * Restrict the maximum quality tier of kit items.
 * [admin] in arena mode
 */
export interface SetKitQualityCommand {
  cmd: 'setkitquality'
  quality: 'poor' | 'low' | 'medium' | 'full'
}

/**
 * Set a team's spawn point to the invoker's current location.
 * [operator] in arena mode
 */
export interface SetTeamSpawnCommand {
  cmd: 'setteamspawn'
  teamNumber: number
}

/**
 * Assign a player to a team.
 * [operator] in arena mode
 */
export interface SetTeamCommand {
  cmd: 'setteam'
  steamId: SteamId
  teamNumber: number
}

/**
 * Start the arena match.
 * [operator] in arena mode
 */
export interface StartMatchCommand {
  cmd: 'startmatch'
}

/**
 * List all defined kit names on this server.
 * [operator] in arena mode (also [admin])
 */
export interface GetAllKitsCommand {
  cmd: 'getallkits'
}

/**
 * List the kits the requesting player is permitted to use.
 * [client] in arena mode
 */
export interface GetKitsCommand {
  cmd: 'getkits'
}

// ── MASTER COMMAND UNION ─────────────────────────────────────────────────────

export type Command =
  // [server]
  | SetServerSettingCommand
  | SetPermissionsCommand
  | RemovePermissionsCommand
  | AuthEnabledCommand
  | AntiCheatEnabledCommand
  | ForceSaveCommand
  | WipeCommand
  // [admin]
  | SpawnCommand
  | SetDataCommand
  | NoclipCommand
  | GodModeCommand
  | SpectatorCommand
  | EnableTracersCommand
  | ForceRespawnLootCommand
  | GetServerSettingsCommand
  | SetTimeCommand
  | SetWeatherCommand
  | SetFogCommand
  | SetAmmoCommand
  | TeleportCommand
  | BanCommand
  | UnbanCommand
  | WhitelistCommand
  | RemoveWhitelistCommand
  | KillPlayerCommand
  | KillAllCommand
  // [operator]
  | GetEntityCommand
  | GetBiomeCommand
  | GetPlayersCommand
  | SeedCommand
  | GetLocationCommand
  | PlayerDataCommand
  | PlayerPartyCommand
  | PlayerInvCommand
  | AddXpCommand
  | AddEffectCommand
  | RemoveEffectCommand
  | ClearEffectsCommand
  | UnlockAllSkillsCommand
  | UnlockAllBlueprintsCommand
  | HealCommand
  | AnnouncementCommand
  | KickCommand
  // [client]
  | GetTimeCommand
  | GetEntitiesCommand
  | GetWorkbenchesCommand
  | GetVehiclesCommand
  | GetEnemiesCommand
  | GetStatusEffectsCommand
  // Arena [admin]
  | SetKitCommand
  | SetKitAllCommand
  | SetKitQualityCommand
  | SetTeamSpawnCommand
  | SetTeamCommand
  | StartMatchCommand
  | GetAllKitsCommand
  // Arena [client]
  | GetKitsCommand

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND RESULT DATA TYPES  (the `data` field inside ResultOk)
// ─────────────────────────────────────────────────────────────────────────────

export interface SetServerSettingResult {
  setting: string
  /** Previous value before the change. */
  previous: string | number | boolean | null
  current: string | number | boolean
}

export interface SetPermissionsResult {
  steamId: SteamId
  level: PermissionLevel
}

export interface RemovePermissionsResult {
  steamId: SteamId
}

export interface AuthEnabledResult {
  authEnabled: boolean
}

export interface AntiCheatResult {
  antiCheatEnabled: boolean
}

export interface ForceSaveResult {
  /** Timestamp the save completed. */
  savedAt: ISOTimestamp
}

export interface WipeResult {
  type: 'map' | 'playerdata' | 'full'
  steamId?: SteamId
  /** Duration of the wipe operation in milliseconds. */
  durationMs: number
}

export interface SpawnResult {
  entity: string
  location: Vec3
}

export interface SetDataResult {
  entityId: string
  key: string
  value: string | number | boolean
}

export interface ToggleResult {
  steamId: SteamId
  enabled: boolean
}

export interface ForceRespawnLootResult {
  respawnedAt: ISOTimestamp
}

export interface GetServerSettingsResult {
  settings: Record<string, string | number | boolean>
}

export interface SetTimeResult {
  /** New time in 0–2400 format. */
  time: number
  /** Human-readable string e.g. "12:00". */
  formatted: string
}

export interface SetWeatherResult {
  weather: WeatherType
}

export interface TeleportResult {
  steamId: SteamId
  from: Vec3
  to: Vec3
}

export interface BanResult {
  steamId: SteamId
  banned: true
}

export interface UnbanResult {
  steamId: SteamId
  banned: false
}

export interface WhitelistResult {
  steamId: SteamId
  whitelisted: true
}

export interface RemoveWhitelistResult {
  steamId: SteamId
  whitelisted: false
}

export interface KillResult {
  steamId: SteamId
}

export interface KillAllResult {
  /** Number of players killed. */
  count: number
}

/** A player entry in the online player list. */
export interface OnlinePlayer {
  steamId: SteamId
  displayName: string
  location: Vec3
  permissionLevel: PermissionLevel
  /** Ping in milliseconds. */
  ping: number
  /** ISO timestamp of when they connected. */
  connectedAt: ISOTimestamp
}

export interface GetPlayersResult {
  players: OnlinePlayer[]
  /** Total count. */
  count: number
}

export interface SeedResult {
  seed: string
  location: Vec3
}

// ── Player Data ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  /** Slot index (0-based). */
  slot: number
  itemId: string
  name: string
  quantity: number
  quality: 'poor' | 'low' | 'medium' | 'full' | null
  /** 0.0–1.0 where 1.0 is full durability. null if item has no durability. */
  durability: number | null
}

export interface PlayerParty {
  partyId: string
  leaderSteamId: SteamId
  members: Array<{
    steamId: SteamId
    displayName: string
    isOnline: boolean
  }>
}

/**
 * Full player data record — returned by `playerdata` command.
 * Represents the data stored in PlayerData/<steamId>.json on disk.
 */
export interface PlayerRecord {
  steamId: SteamId
  displayName: string
  isOnline: boolean
  /** null if player is offline or location is unavailable. */
  location: Vec3 | null
  permissionLevel: PermissionLevel
  /** Current health points. */
  health: number
  maxHealth: number
  /** 0.0 (starving) – 100.0 (full). */
  hunger: number
  /** 0.0 (dehydrated) – 100.0 (hydrated). */
  thirst: number
  /** Current temperature in Celsius. */
  temperature: number
  /** Overall wellness stat (affects health regen and max health). */
  wellness: number
  /** Total XP accumulated. */
  xp: number
  /** Active status effects at time of query. */
  activeEffects: Array<{
    stat: string
    /** Remaining duration in seconds. */
    remainingSeconds: number
    amount: number
  }>
  /** ISO timestamp of last connection. */
  lastSeen: ISOTimestamp | null
}

export interface PlayerDataResult extends PlayerRecord {}

export interface PlayerPartyResult {
  steamId: SteamId
  party: PlayerParty | null
}

export interface PlayerInvResult {
  steamId: SteamId
  displayName: string
  inventory: InventoryItem[]
}

export interface AddXpResult {
  steamId: SteamId
  /** XP awarded in this call. */
  awarded: number
  /** Total XP the player now has. */
  totalXp: number
}

export interface AddEffectResult {
  steamId: SteamId
  stat: string
  duration: number
  amount: number
}

export interface HealResult {
  steamId: SteamId
  health: number
}

export interface AnnouncementResult {
  message: string
  /** Number of players who received it. */
  deliveredTo: number
}

export interface KickResult {
  steamId: SteamId
}

export interface GetTimeResult {
  /** Raw server time 0–2400. */
  time: number
  /** Human-readable e.g. "14:30". */
  formatted: string
}

export interface GetEntitiesResult {
  entities: string[]
}

export interface GetWorkbenchesResult {
  workbenches: string[]
}

export interface GetVehiclesResult {
  vehicles: string[]
}

export interface GetEnemiesResult {
  enemies: string[]
}

export interface GetStatusEffectsResult {
  effects: string[]
}

export interface GetAllKitsResult {
  kits: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER-PUSH EVENTS  (Server → Client, no correlation ID)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper for all server-push events.
 * Clients should subscribe to events of interest and ignore unknown event types
 * to remain forwards-compatible as new events are added.
 */
export interface EventMessage extends BaseMessage {
  type: 'event'
  /** Server time when the event occurred. */
  timestamp: ISOTimestamp
  event: ServerEvent
}

// ── Player Events ─────────────────────────────────────────────────────────────

/** A player successfully joined the server. */
export interface PlayerJoinEvent {
  name: 'player.join'
  steamId: SteamId
  displayName: string
}

/** A player left the server. */
export interface PlayerLeaveEvent {
  name: 'player.leave'
  steamId: SteamId
  displayName: string
  reason: 'disconnect' | 'kick' | 'ban' | 'timeout' | 'error'
}

/**
 * A player was killed (by another player, an NPC, or the environment).
 * Check `killerSteamId` to determine if it was a PvP kill.
 */
export interface PlayerDeathEvent {
  name: 'player.death'
  steamId: SteamId
  displayName: string
  location: Vec3
  /**
   * Cause of death label — e.g. "Gunshot", "Fall", "Starvation", "Drowning",
   * "Bear", "Mechanoid", "Explosion".
   */
  cause: string
  /** Present when the kill was by another player. */
  killerSteamId?: SteamId
  killerDisplayName?: string
  /** Weapon or tool used — present for PvP kills. */
  weapon?: string
}

/** A player sent a chat message. */
export interface PlayerChatEvent {
  name: 'player.chat'
  steamId: SteamId
  displayName: string
  message: string
  channel: 'global' | 'team' | 'local'
}

/** A player was banned via in-game command or RCON. */
export interface PlayerBanEvent {
  name: 'player.ban'
  steamId: SteamId
  displayName: string
  /** "rcon" when issued via RCON, or the SteamId of the admin who issued it. */
  bannedBy: 'rcon' | SteamId
}

/** A player was kicked via in-game command or RCON. */
export interface PlayerKickEvent {
  name: 'player.kick'
  steamId: SteamId
  displayName: string
  kickedBy: 'rcon' | SteamId
}

/** A player's permission level was changed. */
export interface PlayerPermissionChangeEvent {
  name: 'player.permission.change'
  steamId: SteamId
  displayName: string
  previous: PermissionLevel | null
  current: PermissionLevel | null
  /** "rcon" or SteamId of the admin who changed it. */
  changedBy: 'rcon' | SteamId
}

// ── Server Events ─────────────────────────────────────────────────────────────

/** The server successfully saved all data to disk. */
export interface ServerSaveEvent {
  name: 'server.save'
  /** Whether this was triggered manually (forcesave) or by the auto-save timer. */
  trigger: 'auto' | 'manual'
}

/** The server is about to restart. */
export interface ServerRestartEvent {
  name: 'server.restart'
  reason: string
  /** Seconds until restart. */
  countdownSeconds: number
}

/** The server has fully started and is accepting connections. */
export interface ServerStartEvent {
  name: 'server.start'
  serverName: string
  seed: string
  /** Number of players the server is configured to accept. */
  maxPlayers: number
}

/** The server is shutting down. */
export interface ServerShutdownEvent {
  name: 'server.shutdown'
  reason: 'graceful' | 'crash' | 'update'
}

/** A server setting was changed via RCON or in-game. */
export interface ServerSettingChangeEvent {
  name: 'server.setting.change'
  setting: string
  previous: string | number | boolean | null
  current: string | number | boolean
  changedBy: 'rcon' | SteamId
}

// ── Wipe Events ───────────────────────────────────────────────────────────────

/** A wipe operation has started. */
export interface WipeStartEvent {
  name: 'wipe.start'
  type: 'map' | 'playerdata' | 'full'
  /** "rcon" or SteamId of the admin who initiated it. */
  initiatedBy: 'rcon' | SteamId
  /** Steam ID of the specific player being wiped, if applicable. */
  targetSteamId?: SteamId
}

/** A wipe operation completed successfully. */
export interface WipeCompleteEvent {
  name: 'wipe.complete'
  type: 'map' | 'playerdata' | 'full'
  durationMs: number
  targetSteamId?: SteamId
}

// ── World Events ─────────────────────────────────────────────────────────────

/** Loot has been force-respawned across the map. */
export interface LootRespawnEvent {
  name: 'world.loot.respawn'
  trigger: 'auto' | 'manual'
}

/** Server time crossed midnight — used to track day cycles. */
export interface DayChangeEvent {
  name: 'world.day.change'
  /** Day number since the world was created. */
  day: number
}

/** The weather state changed. */
export interface WeatherChangeEvent {
  name: 'world.weather.change'
  previous: WeatherType
  current: WeatherType
}

// ── Arena Events ──────────────────────────────────────────────────────────────

/** An arena match started. */
export interface ArenaMatchStartEvent {
  name: 'arena.match.start'
  matchId: string
  kit: string
  teams: number[]
  participants: Array<{ steamId: SteamId; teamNumber: number }>
}

/** An arena match ended. */
export interface ArenaMatchEndEvent {
  name: 'arena.match.end'
  matchId: string
  /** Winning team number, or null for a draw. */
  winnerTeam: number | null
  durationSeconds: number
  scores: Record<number, number>
}

/** A player respawned during an arena match. */
export interface ArenaPlayerRespawnEvent {
  name: 'arena.player.respawn'
  matchId: string
  steamId: SteamId
  displayName: string
  teamNumber: number
}

// ── MASTER EVENT UNION ────────────────────────────────────────────────────────

export type ServerEvent =
  // Player
  | PlayerJoinEvent
  | PlayerLeaveEvent
  | PlayerDeathEvent
  | PlayerChatEvent
  | PlayerBanEvent
  | PlayerKickEvent
  | PlayerPermissionChangeEvent
  // Server
  | ServerSaveEvent
  | ServerRestartEvent
  | ServerStartEvent
  | ServerShutdownEvent
  | ServerSettingChangeEvent
  // Wipe
  | WipeStartEvent
  | WipeCompleteEvent
  // World
  | LootRespawnEvent
  | DayChangeEvent
  | WeatherChangeEvent
  // Arena
  | ArenaMatchStartEvent
  | ArenaMatchEndEvent
  | ArenaPlayerRespawnEvent

// ─────────────────────────────────────────────────────────────────────────────
// MASTER MESSAGE UNION
// ─────────────────────────────────────────────────────────────────────────────

/** Every message that flows over the WebSocket connection. */
export type AnyMessage =
  | AuthMessage
  | AuthOkMessage
  | AuthErrorMessage
  | PingMessage
  | PongMessage
  | CommandMessage
  | Result
  | EventMessage