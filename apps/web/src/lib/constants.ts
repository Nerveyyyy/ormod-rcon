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
export const GAME_COMMANDS: GameCommand[] = [
  { cmd: 'getplayers', desc: 'List all players', perm: 'operator' },
  { cmd: 'getserversettings', desc: 'Show current settings', perm: 'admin' },
  { cmd: 'forcesave', desc: 'Force world save', perm: 'server' },
  { cmd: 'announcement [msg]', desc: 'Broadcast to all players', perm: 'operator' },
  { cmd: 'settime [0000-2400]', desc: 'Set world time', perm: 'admin' },
  { cmd: 'setweather [type]', desc: 'cloudy / stormy / clear', perm: 'admin' },
  { cmd: 'setfog [true/false]', desc: 'Toggle world fog', perm: 'admin' },
  { cmd: 'kick [steamId]', desc: 'Kick a player', perm: 'operator' },
  { cmd: 'ban [steamId]', desc: 'Ban a player', perm: 'admin' },
  { cmd: 'unban [steamId]', desc: 'Unban a player', perm: 'admin' },
  { cmd: 'whitelist [steamId]', desc: 'Add to whitelist.txt', perm: 'admin' },
  { cmd: 'teleport [steamId]', desc: 'Teleport self to player', perm: 'admin' },
  { cmd: 'heal [steamId]', desc: 'Reset all player stats', perm: 'operator' },
  { cmd: 'addxp [steamId] [amt]', desc: 'Give XP to a player', perm: 'operator' },
  { cmd: 'spawn [entity]', desc: 'Spawn entity at position', perm: 'admin' },
  { cmd: 'setpermissions [id] [lvl]', desc: 'Set player permission level', perm: 'server' },
  { cmd: 'authenabled [true/false]', desc: 'Toggle server-side auth', perm: 'server' },
  { cmd: 'anticheatenabled [true/false]', desc: 'Toggle anti-cheat system', perm: 'server' },
  { cmd: 'forcerespawnloot', desc: 'Force respawn all loot pools', perm: 'admin' },
]
