// Types track rcon/README.md (protocol v1.0.0). Wire envelopes (auth/ping/
// pong/raw result wrappers) stay in codec.ts and are not exported.

export type SteamId = string

export interface Location {
  x: number
  y: number
  z: number
}

export type IsoTimestamp = string

// ── Commands ────────────────────────────────────────────────────────────────
// Callers pass `cmd` + `data` only — `id` and `type: 'command'` are added
// by the codec.

export type RconWipeType = 'map' | 'playerdata' | 'full'

export type RconCommand =
  | { cmd: 'kick', data: { steamId: SteamId, reason?: string } }
  | {
      cmd: 'ban',
      data: {
        steamId: SteamId,
        reason?: string,
        durationMinutes?: number,
      },
    }
  | { cmd: 'setserversetting', data: { setting: string, value: unknown } }
  | {
      cmd: 'wipe',
      data:
        | { type: 'map' }
        | { type: 'playerdata', steamId: SteamId }
        | { type: 'full' },
    }
  | {
      cmd: 'spawn',
      data:
        | { entity: string, steamId: SteamId }
        | { entity: string, x: number, y: number, z: number },
    }
  | {
      cmd: 'teleport',
      data:
        | { steamId: SteamId, toSteamId: SteamId }
        | { steamId: SteamId, x: number, y: number, z: number },
    }
  | { cmd: 'playerdata', data: { steamId: SteamId } }
  | { cmd: 'playerparty', data: { steamId: SteamId } }
  | { cmd: 'playerinv', data: { steamId: SteamId } }
  | { cmd: 'privatemessage', data: { steamId: SteamId, message: string } }
  | { cmd: 'getplayers' }
  | { cmd: 'getbans' }
  | { cmd: 'getwhitelist' }
  | { cmd: 'getadmins' }
  | { cmd: 'serverstatus' }
  | { cmd: 'serverperformance' }
  | { cmd: 'forcesave' }

// ── Events ──────────────────────────────────────────────────────────────────
// Flat shape: each variant exposes `name` + `timestamp` + its own fields.
// The catch-all variant at the bottom covers spec §4's "ignore unknown".

export type RconPlayerLeaveReason =
  | 'disconnect'
  | 'kick'
  | 'ban'
  | 'timeout'
  | 'error'

export type RconChatChannel = 'global' | 'team' | 'local'

export type RconDeathSource = 'suicide' | 'environment' | 'ai' | 'player'

export type RconHitZone =
  | 'head'
  | 'chest'
  | 'stomach'
  | 'arm_left'
  | 'arm_right'
  | 'leg_left'
  | 'leg_right'
  | 'other'

export type RconAntiCheatAction = 'none' | 'warned' | 'kicked' | 'banned'

export type RconConnectRejectedReason =
  | 'banned'
  | 'not_whitelisted'
  | 'server_full'
  | 'auth_failed'
  | 'version_mismatch'

export type RconPartyAction = 'joined' | 'left' | 'disbanded'

export interface RconDeathVictim {
  steamId: SteamId
  location: Location
}

export interface RconDeathKiller {
  steamId?: SteamId
  npcType?: string
  location?: Location
}

export interface RconDeathWeapon {
  itemId: string
  name: string
  attachments?: string[]
  ammoType?: string
}

export interface RconDeathHit {
  zone: RconHitZone
  headshot: boolean
  distanceMeters: number
}

export type RconEvent =
  | {
      name: 'player.join',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      ip: string,
    }
  | {
      name: 'player.leave',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      reason: RconPlayerLeaveReason,
    }
  | {
      name: 'player.death',
      timestamp: IsoTimestamp,
      victim: RconDeathVictim,
      source: RconDeathSource,
      cause: string,
      killer?: RconDeathKiller,
      weapon?: RconDeathWeapon,
      hit?: RconDeathHit,
    }
  | {
      name: 'player.chat',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      message: string,
      channel: RconChatChannel,
    }
  | {
      name: 'player.ban',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      bannedBy: string,
      reason?: string,
    }
  | {
      name: 'player.kick',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      kickedBy: string,
      reason?: string,
    }
  | {
      name: 'player.permission.change',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      previous: string | null,
      current: string | null,
      changedBy: string,
    }
  | {
      name: 'player.connect.rejected',
      timestamp: IsoTimestamp,
      steamId?: SteamId,
      ip: string,
      reason: RconConnectRejectedReason,
    }
  | {
      name: 'player.party.change',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      partyId: string | null,
      action: RconPartyAction,
    }
  | {
      name: 'server.start',
      timestamp: IsoTimestamp,
      serverName: string,
      gameVersion: string,
      seed: string,
      maxPlayers: number,
    }
  | { name: 'server.save', timestamp: IsoTimestamp }
  | { name: 'server.restart', timestamp: IsoTimestamp, countdownSeconds?: number }
  | { name: 'server.shutdown', timestamp: IsoTimestamp }
  | {
      name: 'server.setting.change',
      timestamp: IsoTimestamp,
      setting: string,
      value: unknown,
    }
  | {
      name: 'server.command.executed',
      timestamp: IsoTimestamp,
      cmd: string,
      args: Record<string, unknown>,
      executedBy: string,
      success: boolean,
    }
  | {
      name: 'wipe.start',
      timestamp: IsoTimestamp,
      type: RconWipeType,
      initiatedBy: string,
    }
  | {
      name: 'wipe.complete',
      timestamp: IsoTimestamp,
      type: RconWipeType,
      durationMs: number,
      wipedAt: IsoTimestamp,
    }
  | { name: 'world.loot.respawn', timestamp: IsoTimestamp }
  | { name: 'world.day.change', timestamp: IsoTimestamp }
  | { name: 'world.weather.change', timestamp: IsoTimestamp }
  | { name: 'arena.match.start', timestamp: IsoTimestamp }
  | { name: 'arena.match.end', timestamp: IsoTimestamp }
  | { name: 'arena.player.respawn', timestamp: IsoTimestamp }
  | {
      name: 'anticheat.alert',
      timestamp: IsoTimestamp,
      steamId: SteamId,
      displayName: string,
      location: Location,
      detectionType: string,
      severity: string,
      details: string,
      actionTaken: RconAntiCheatAction,
    }
  // Forward-compat catch-all — see spec §4.
  | {
      name: string,
      timestamp: IsoTimestamp,
      [field: string]: unknown,
    }
