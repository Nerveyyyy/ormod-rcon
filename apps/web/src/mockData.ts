// ── Servers ────────────────────────────────────────────────────────────
export const mockServers = [
  { id: 's1', name: 'My Survival World', serverName: 'my-survival-world', gameType: 'Cooperative', online: true,  players: 5, maxPlayers: 16 },
  { id: 's2', name: 'PVP Arena',          serverName: 'pvp-arena',          gameType: 'PVP',         online: true,  players: 3, maxPlayers: 32 },
  { id: 's3', name: 'Creative Build',     serverName: 'creative-build',     gameType: 'Creative',    online: false, players: 0, maxPlayers: 8  },
];

// ── Players ────────────────────────────────────────────────────────────
export const mockPlayers = [
  { steam: '76561198001234567', name: 'SurvivorMike',  perm: 'server',   online: true,  playtime: '14h 32m', location: 'Pine Forest' },
  { steam: '76561198009876543', name: 'Wanderer_K',    perm: 'admin',    online: true,  playtime: '6h 10m',  location: 'Desert'      },
  { steam: '76561198012345678', name: 'NomadRex',      perm: 'operator', online: true,  playtime: '2h 55m',  location: 'Ruins'       },
  { steam: '76561198087654321', name: 'delta_scout',   perm: 'client',   online: true,  playtime: '0h 47m',  location: 'Wetlands'    },
  { steam: '76561198055555555', name: 'IronCraft99',   perm: 'client',   online: false, playtime: '22h 04m', location: '—'           },
  { steam: '76561198033333333', name: 'ghost_loop',    perm: 'client',   online: true,  playtime: '1h 18m',  location: 'Tundra'      },
];

// ── Activity log ───────────────────────────────────────────────────────
export const mockLog = [
  { time: '14:38:04', type: 'join',  msg: 'ghost_loop connected [76561198033333333]'               },
  { time: '14:37:50', type: 'save',  msg: 'World auto-saved (SaveInterval: 120s)'                  },
  { time: '14:37:10', type: 'cmd',   msg: 'Wanderer_K: setweather stormy'                          },
  { time: '14:36:45', type: 'warn',  msg: 'Server memory usage high (82%)'                         },
  { time: '14:36:01', type: 'cmd',   msg: 'SurvivorMike: announcement Server restarting in 10 min' },
  { time: '14:35:33', type: 'leave', msg: 'IronCraft99 disconnected — user quit'                   },
  { time: '14:34:12', type: 'cmd',   msg: 'NomadRex: heal 76561198087654321'                       },
  { time: '14:33:58', type: 'join',  msg: 'delta_scout connected [76561198087654321]'              },
  { time: '14:32:40', type: 'ban',   msg: 'Wanderer_K: ban 76561197999000111 — Cheating'           },
  { time: '14:31:00', type: 'save',  msg: 'World auto-saved (SaveInterval: 120s)'                  },
  { time: '14:29:15', type: 'join',  msg: 'NomadRex connected [76561198012345678]'                 },
  { time: '14:27:40', type: 'cmd',   msg: 'SurvivorMike: settime 1200'                             },
  { time: '14:25:10', type: 'warn',  msg: 'High entity count in chunk (0,0) — 312 entities'        },
  { time: '14:20:00', type: 'save',  msg: 'World auto-saved (SaveInterval: 120s)'                  },
];

// ── Access lists ───────────────────────────────────────────────────────
export const mockAccessLists = [
  { id: 'al1', name: 'Global Ban List',        type: 'BAN',       scope: 'GLOBAL',   entryCount: 3,   readonly: false, syncedAt: null,               externalUrl: null },
  { id: 'al2', name: 'My Survival World Bans', type: 'BAN',       scope: 'SERVER',   entryCount: 1,   readonly: false, syncedAt: null,               externalUrl: null },
  { id: 'al3', name: 'Community Ban List',      type: 'BAN',       scope: 'EXTERNAL', entryCount: 847, readonly: true,  syncedAt: '2026-02-21 12:00', externalUrl: 'https://communitybanlist.example/feed.json' },
  { id: 'al4', name: 'Member Whitelist',        type: 'WHITELIST', scope: 'SERVER',   entryCount: 3,   readonly: false, syncedAt: null,               externalUrl: null },
  { id: 'al5', name: 'Admin Roster',           type: 'ADMIN',     scope: 'SERVER',   entryCount: 3,   readonly: false, syncedAt: null,               externalUrl: null },
];

export const mockBans: Record<string, { steam: string; name: string; reason: string; by: string; date: string }[]> = {
  al1: [
    { steam: '76561197999000111', name: 'xAimbotUserx',   reason: 'Cheating — aimbot suspected',       by: 'Wanderer_K',   date: '2026-02-21' },
    { steam: '76561197888000222', name: 'GrieferBoss',    reason: 'Excessive griefing / base spam',    by: 'SurvivorMike', date: '2026-02-18' },
    { steam: '76561197777000333', name: 'chat_spammer',   reason: 'Spam / advertising',                by: 'Wanderer_K',   date: '2026-02-15' },
  ],
  al2: [
    { steam: '76561197666000444', name: 'ToxicPlayer42',  reason: 'Harassment in voice comms',         by: 'SurvivorMike', date: '2026-02-21' },
  ],
  al3: [
    { steam: '76561197555000001', name: 'HackMaster9000', reason: 'VAC ban on record',                 by: 'Community',    date: '2026-02-20' },
    { steam: '76561197555000002', name: 'WallHaxUser',    reason: 'Known cheater — multiple servers',  by: 'Community',    date: '2026-02-19' },
    { steam: '76561197555000003', name: 'DupeBug_abuser', reason: 'Economy exploit abuse',             by: 'Community',    date: '2026-02-18' },
    { steam: '76561197555000004', name: 'racist_slurs',   reason: 'Hate speech',                       by: 'Community',    date: '2026-02-17' },
    { steam: '76561197555000005', name: 'ScriptKiddie',   reason: 'Server DoS attempt',                by: 'Community',    date: '2026-02-15' },
  ],
};

// ── Whitelist entries ──────────────────────────────────────────────────
export const mockWhitelist = [
  { steam: '76561198001234567', name: 'SurvivorMike',   added: '2026-02-10' },
  { steam: '76561198009876543', name: 'Wanderer_K',     added: '2026-02-10' },
  { steam: '76561198044444444', name: 'PlaytestUser01', added: '2026-02-20' },
];

// ── Admin entries ──────────────────────────────────────────────────────
export const mockAdmins = [
  { steam: '76561198001234567', name: 'SurvivorMike', perm: 'server'   },
  { steam: '76561198009876543', name: 'Wanderer_K',   perm: 'admin'    },
  { steam: '76561198012345678', name: 'NomadRex',     perm: 'operator' },
];

// ── Server settings ────────────────────────────────────────────────────
// Keys match the actual ORMOD: Directive serversettings.json format (Playtest 1.9.0).
// Read-only fields (written by the game, not editable) are marked type: 'readonly'.
export const settingGroups = [
  {
    label: 'General',
    settings: [
      { key: 'WorldName',    name: 'World Name',    desc: 'Save folder name for this world (set by -servername flag at launch)',  type: 'readonly', value: '' },
      { key: 'IsOnline',     name: 'Server Browser',desc: 'List this server in the public browser',                              type: 'bool',     value: true  },
      { key: 'FriendsOnly',  name: 'Friends Only',  desc: 'Only Steam friends of the host can join',                             type: 'bool',     value: false },
      { key: 'MaxPlayers',   name: 'Max Players',   desc: 'Maximum concurrent player slots',                                     type: 'number',   value: 8     },
      { key: 'Description',  name: 'Description',   desc: 'Shown in the server browser',                                         type: 'text',     value: ''    },
    ],
  },
  {
    label: 'Difficulty',
    settings: [
      { key: 'WorldRobotDensity', name: 'Robot Density',       desc: 'Multiplier for ORMOD robot spawn density (1.0 = default)',     type: 'number', value: 1.0 },
      { key: 'RobotPlating',      name: 'Robot Plating',       desc: 'Robot armour thickness multiplier (1.0 = default)',            type: 'number', value: 1.0 },
      { key: 'RobotDifficulty',   name: 'Robot Difficulty',    desc: 'Overall ORMOD AI difficulty multiplier (1.0 = default)',       type: 'number', value: 1.0 },
      { key: 'SkuttlerSpeed',     name: 'Skuttler Speed (Day)',   desc: 'Skuttler movement speed during daytime',                   type: 'number', value: 2   },
      { key: 'SkuttlerNightSpeed',name: 'Skuttler Speed (Night)', desc: 'Skuttler movement speed at night — usually higher',        type: 'number', value: 4   },
    ],
  },
  {
    label: 'Server Info (read-only)',
    settings: [
      { key: 'ServerVersion',  name: 'Server Version', desc: 'Game build version — set by the server binary',           type: 'readonly', value: '' },
      { key: 'ServerGamePort', name: 'Game Port',      desc: 'UDP port configured in serversettings.json',              type: 'readonly', value: '' },
      { key: 'ServerQueryPort',name: 'Query Port',     desc: 'UDP query port configured in serversettings.json',        type: 'readonly', value: '' },
    ],
  },
];

// ── Console quick commands ─────────────────────────────────────────────
export const quickCmds = [
  { cmd: 'getplayers',                    desc: 'List all players',             perm: 'operator' },
  { cmd: 'getserversettings',             desc: 'Show current settings',        perm: 'admin'    },
  { cmd: 'forcesave',                     desc: 'Force world save',             perm: 'server'   },
  { cmd: 'announcement [msg]',            desc: 'Broadcast to all players',     perm: 'operator' },
  { cmd: 'settime [0000-2400]',           desc: 'Set world time',               perm: 'admin'    },
  { cmd: 'setweather [type]',             desc: 'cloudy / stormy / clear',      perm: 'admin'    },
  { cmd: 'setfog [true/false]',           desc: 'Toggle world fog',             perm: 'admin'    },
  { cmd: 'kick [steamId]',                desc: 'Kick a player',                perm: 'operator' },
  { cmd: 'ban [steamId]',                 desc: 'Ban a player',                 perm: 'admin'    },
  { cmd: 'unban [steamId]',               desc: 'Unban a player',               perm: 'admin'    },
  { cmd: 'whitelist [steamId]',           desc: 'Add to whitelist.txt',         perm: 'admin'    },
  { cmd: 'teleport [steamId]',            desc: 'Teleport self to player',      perm: 'admin'    },
  { cmd: 'heal [steamId]',                desc: 'Reset all player stats',       perm: 'operator' },
  { cmd: 'addxp [steamId] [amt]',         desc: 'Give XP to a player',          perm: 'operator' },
  { cmd: 'spawn [entity]',                desc: 'Spawn entity at position',     perm: 'admin'    },
  { cmd: 'setpermissions [id] [lvl]',     desc: 'Set player permission level',  perm: 'server'   },
  { cmd: 'authenabled [true/false]',      desc: 'Toggle server-side auth',      perm: 'server'   },
  { cmd: 'anticheatenabled [true/false]', desc: 'Toggle anti-cheat system',     perm: 'server'   },
  { cmd: 'forcerespawnloot',              desc: 'Force respawn all loot pools', perm: 'admin'    },
];

// ── Wipe history ───────────────────────────────────────────────────────
export const wipeHistory = [
  { id: 1, type: 'MAP_ONLY', by: 'SurvivorMike',   date: '2026-02-10 06:00', notes: 'Bi-weekly map wipe', backup: true, success: true },
  { id: 2, type: 'MAP_ONLY', by: 'Auto-Scheduler', date: '2026-01-27 06:00', notes: 'Scheduled wipe',      backup: true, success: true },
  { id: 3, type: 'FULL',     by: 'SurvivorMike',   date: '2026-01-01 00:00', notes: 'New Year full wipe',  backup: true, success: true },
];

// ── Scheduled tasks ────────────────────────────────────────────────────
export const mockSchedules = [
  { id: 1, label: 'Weekly Map Wipe',         type: 'WIPE',         cronExpr: '0 6 * * 1',    schedule: 'Every Monday at 06:00 UTC', payload: 'MAP_ONLY',                       enabled: true,  nextRun: 'Mon 2026-02-25 06:00', lastRun: 'Mon 2026-02-10 06:00' },
  { id: 2, label: 'Daily Server Rules',      type: 'ANNOUNCEMENT', cronExpr: '0 12 * * *',   schedule: 'Every day at 12:00 UTC',    payload: 'Read the rules at discord.gg/…', enabled: true,  nextRun: 'Sat 2026-02-22 12:00', lastRun: 'Fri 2026-02-21 12:00' },
  { id: 3, label: 'Bi-daily Loot Respawn',   type: 'COMMAND',      cronExpr: '0 */12 * * *', schedule: 'Every 12 hours',            payload: 'forcerespawnloot',               enabled: true,  nextRun: 'Sat 2026-02-22 00:00', lastRun: 'Fri 2026-02-21 12:00' },
  { id: 4, label: 'Server Restart (Paused)', type: 'RESTART',      cronExpr: '0 4 * * *',    schedule: 'Every day at 04:00 UTC',    payload: '{}',                             enabled: false, nextRun: '—',                    lastRun: 'Never' },
];

// ── Console initial output ─────────────────────────────────────────────
export const consoleInit = [
  { cls: 'c-comment', text: '# ORMOD: Directive — Server Console'                                               },
  { cls: 'c-comment', text: '# World: My Survival World  |  SteamCMD Dedicated Server'                         },
  { cls: 'c-comment', text: '# Permissions: [server] > [admin] > [operator] > [client]'                        },
  { cls: 'c-comment', text: '#'                                                                                  },
  { cls: 'c-info',    text: '  getplayers'                                                                       },
  { cls: 'c-ok',      text: '  [6] SurvivorMike · Wanderer_K · NomadRex · delta_scout · ghost_loop + 1 offline' },
  { cls: 'c-info',    text: '  getserversettings'                                                                },
  { cls: 'c-ok',      text: '  GameType: Cooperative | MaxPlayers: 16 | IsHardcore: false | WorldOvergrowth: 0.4'},
  { cls: 'c-info',    text: '  announcement Welcome to the server! Please read the rules in Discord.'            },
  { cls: 'c-ok',      text: '  [OK] Announcement sent to all players.'                                          },
];
