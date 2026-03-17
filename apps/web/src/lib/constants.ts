// ── Role-to-CSS-class helper ────────────────────────────────────────────

export function roleToClass(role: string): string {
  if (role === 'OWNER') return 'role-owner'
  if (role === 'ADMIN') return 'role-admin'
  return 'role-viewer'
}

// ── Server setting types ────────────────────────────────────────────────

export type SettingType = 'readonly' | 'bool' | 'number' | 'text' | 'select'

export interface Setting {
  key: string
  name: string
  desc: string
  type: SettingType
  value: string | number | boolean
}

export interface SettingGroup {
  label: string
  settings: Setting[]
}

// ── Game command types ──────────────────────────────────────────────────

export type CommandPerm = 'operator' | 'admin' | 'server'

export interface GameCommand {
  cmd: string
  desc: string
  perm: CommandPerm
}

// ── Server settings ─────────────────────────────────────────────────────
// Keys match the actual ORMOD: Directive serversettings.json format (Playtest 1.9.0).
// Read-only fields (written by the game, not editable) are marked type: 'readonly'.
export const SERVER_SETTING_GROUPS: SettingGroup[] = [
  {
    label: 'General',
    settings: [
      {
        key: 'WorldName',
        name: 'World Name',
        desc: 'Save folder name for this world (set by -servername flag at launch)',
        type: 'readonly',
        value: '',
      },
      {
        key: 'IsOnline',
        name: 'Server Browser',
        desc: 'List this server in the public browser',
        type: 'bool',
        value: true,
      },
      {
        key: 'FriendsOnly',
        name: 'Friends Only',
        desc: 'Only Steam friends of the host can join',
        type: 'bool',
        value: false,
      },
      {
        key: 'MaxPlayers',
        name: 'Max Players',
        desc: 'Maximum concurrent player slots',
        type: 'number',
        value: 8,
      },
      {
        key: 'Description',
        name: 'Description',
        desc: 'Shown in the server browser',
        type: 'text',
        value: '',
      },
    ],
  },
  {
    label: 'Difficulty',
    settings: [
      {
        key: 'WorldRobotDensity',
        name: 'Robot Density',
        desc: 'Multiplier for ORMOD robot spawn density (1.0 = default)',
        type: 'number',
        value: 1.0,
      },
      {
        key: 'RobotPlating',
        name: 'Robot Plating',
        desc: 'Robot armour thickness multiplier (1.0 = default)',
        type: 'number',
        value: 1.0,
      },
      {
        key: 'RobotDifficulty',
        name: 'Robot Difficulty',
        desc: 'Overall ORMOD AI difficulty multiplier (1.0 = default)',
        type: 'number',
        value: 1.0,
      },
      {
        key: 'SkuttlerSpeed',
        name: 'Skuttler Speed (Day)',
        desc: 'Skuttler movement speed during daytime',
        type: 'number',
        value: 2,
      },
      {
        key: 'SkuttlerNightSpeed',
        name: 'Skuttler Speed (Night)',
        desc: 'Skuttler movement speed at night — usually higher',
        type: 'number',
        value: 4,
      },
    ],
  },
  {
    label: 'Server Info (read-only)',
    settings: [
      {
        key: 'ServerVersion',
        name: 'Server Version',
        desc: 'Game build version — set by the server binary',
        type: 'readonly',
        value: '',
      },
      {
        key: 'ServerGamePort',
        name: 'Game Port',
        desc: 'UDP port configured in serversettings.json',
        type: 'readonly',
        value: '',
      },
      {
        key: 'ServerQueryPort',
        name: 'Query Port',
        desc: 'UDP query port configured in serversettings.json',
        type: 'readonly',
        value: '',
      },
    ],
  },
]

// ── Console quick commands ──────────────────────────────────────────────
// Full reference: docs/game-commands.md
export const GAME_COMMANDS: GameCommand[] = [
  // [server]
  { cmd: 'forcesave', desc: 'Force world save', perm: 'server' },
  { cmd: 'setserversetting [setting] [value]', desc: 'Set a server setting', perm: 'server' },
  { cmd: 'setpermissions [steamId] [level]', desc: 'Set player permission level', perm: 'server' },
  { cmd: 'removepermissions [steamId]', desc: 'Remove player permissions', perm: 'server' },
  { cmd: 'authenabled [true/false]', desc: 'Enable/disable serverside auth', perm: 'server' },
  { cmd: 'anticheatenabled [true/false]', desc: 'Enable/disable anticheat', perm: 'server' },
  // [admin]
  { cmd: 'getserversettings', desc: 'Show all current server settings', perm: 'admin' },
  { cmd: 'ban [steamId]', desc: 'Ban a player', perm: 'admin' },
  { cmd: 'unban [steamId]', desc: 'Unban a player', perm: 'admin' },
  { cmd: 'whitelist [steamId]', desc: 'Whitelist a player', perm: 'admin' },
  { cmd: 'removewhitelist [steamId]', desc: 'Remove player from whitelist', perm: 'admin' },
  { cmd: 'kill [steamId]', desc: 'Kill a player', perm: 'admin' },
  { cmd: 'killall', desc: 'Kill all players', perm: 'admin' },
  { cmd: 'teleport [steamId]', desc: 'Teleport self to player', perm: 'admin' },
  { cmd: 'teleport [from] [to]', desc: 'Teleport one player to another', perm: 'admin' },
  { cmd: 'teleport [x] [y] [z]', desc: 'Teleport self to coordinates', perm: 'admin' },
  { cmd: 'teleport [steamId] [x] [y] [z]', desc: 'Teleport player to coordinates', perm: 'admin' },
  { cmd: 'settime [0000-2400]', desc: 'Set world time', perm: 'admin' },
  { cmd: 'setweather [type]', desc: 'cloudy/stormy/overcast/sparse/clear/lightningstorm/lightrain', perm: 'admin' },
  { cmd: 'setfog [true/false]', desc: 'Toggle world fog', perm: 'admin' },
  { cmd: 'setammo [true/false]', desc: 'Weapons & turrets use ammo', perm: 'admin' },
  { cmd: 'spawn [entity]', desc: 'Spawn entity here', perm: 'admin' },
  { cmd: 'spawn [entity] [steamId]', desc: 'Spawn entity at player', perm: 'admin' },
  { cmd: 'godmode', desc: 'Toggle self godmode', perm: 'admin' },
  { cmd: 'godmode [steamId] [true/false]', desc: 'Set player godmode', perm: 'admin' },
  { cmd: 'noclip', desc: 'Toggle self noclip', perm: 'admin' },
  { cmd: 'noclip [steamId] [true/false]', desc: 'Set player noclip', perm: 'admin' },
  { cmd: 'spectator', desc: 'Toggle self spectator', perm: 'admin' },
  { cmd: 'spectator [steamId] [true/false]', desc: 'Set player spectator', perm: 'admin' },
  { cmd: 'forcerespawnloot', desc: 'Force respawn all loot pools', perm: 'admin' },
  { cmd: 'enabletracers [true/false]', desc: 'Enable/disable tracers', perm: 'admin' },
  { cmd: 'setdata [entityId] [key] [value]', desc: 'Set entity data tag', perm: 'admin' },
  // [operator]
  { cmd: 'getplayers', desc: 'List all players on server', perm: 'operator' },
  { cmd: 'announcement [message]', desc: 'Send chat announcement to all players', perm: 'operator' },
  { cmd: 'kick [steamId]', desc: 'Kick a player', perm: 'operator' },
  { cmd: 'heal [steamId]', desc: 'Reset all stats of player', perm: 'operator' },
  { cmd: 'heal', desc: 'Reset all stats of self', perm: 'operator' },
  { cmd: 'addxp [steamId] [amount]', desc: 'Add XP to player', perm: 'operator' },
  { cmd: 'addxp [amount]', desc: 'Add XP to self', perm: 'operator' },
  { cmd: 'addeffect [steamId] [stat] [dur] [amt]', desc: 'Add effect to player', perm: 'operator' },
  { cmd: 'removeeffect [steamId] [stat]', desc: 'Remove effect from player', perm: 'operator' },
  { cmd: 'cleareffects [steamId]', desc: 'Clear all effects from player', perm: 'operator' },
  { cmd: 'unlockallskills [steamId]', desc: 'Unlock all skills for player', perm: 'operator' },
  { cmd: 'unlockallblueprints [steamId]', desc: 'Unlock all blueprints for player', perm: 'operator' },
  { cmd: 'getlocation', desc: 'Get current location', perm: 'operator' },
  { cmd: 'seed', desc: 'Get current location and seed', perm: 'operator' },
  { cmd: 'getentity', desc: 'Get looking-at entity ID', perm: 'operator' },
  { cmd: 'getbiome', desc: 'Get current biome', perm: 'operator' },
  { cmd: 'setteam [steamId] [teamnumber]', desc: 'Set player arena team', perm: 'operator' },
  { cmd: 'setteamspawn [teamnumber]', desc: 'Set arena team spawn here', perm: 'operator' },
  { cmd: 'startmatch', desc: 'Start new arena match', perm: 'operator' },
  { cmd: 'getallkits', desc: 'Get all kits on server', perm: 'operator' },
]
