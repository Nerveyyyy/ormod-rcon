import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   ORMOD: Directive — Community RCON Panel
   Rebuilt using actual wiki data:
   - Correct permission levels: [server] > [admin] > [operator] > [client]
   - Real console commands from Console Commands wiki page
   - Real serversettings.json keys from Server Settings wiki page
   - Survival sandbox context (not military/tactical)
   - adminlist.txt, banlist.txt, whitelist.txt file structure
───────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg0: #0e0f0d;
  --bg1: #141511;
  --bg2: #1a1c17;
  --bg3: #21231d;
  --border: #2c2e26;
  --border2: #3a3c32;
  --orange: #d97a30;
  --orange-dim: #7a3e10;
  --orange-bg: rgba(217,122,48,0.08);
  --green: #7cb87a;
  --green-dim: #2d5c2b;
  --green-bg: rgba(124,184,122,0.08);
  --red: #c95555;
  --red-dim: #5c2222;
  --red-bg: rgba(201,85,85,0.08);
  --blue: #5b9dc9;
  --blue-dim: #1e3f5a;
  --blue-bg: rgba(91,157,201,0.08);
  --muted: #888a7c;
  --dim: #4a4c42;
  --text: #dddbd0;
  --text-bright: #f0ede0;
  --mono: 'IBM Plex Mono', monospace;
  --sans: 'Sora', sans-serif;
}

body { background: var(--bg0); }

.app {
  font-family: var(--sans);
  min-height: 100vh;
  background: var(--bg0);
  color: var(--text);
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--bg1);
  border-bottom: 1px solid var(--border);
  padding: 0 28px;
  height: 58px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}

.logo-area { display: flex; align-items: center; gap: 12px; }

.logo-icon {
  width: 32px; height: 32px;
  background: var(--orange-bg);
  border: 1px solid var(--orange-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}

.logo-text {
  font-family: var(--sans);
  font-weight: 700;
  font-size: 15px;
  color: var(--text-bright);
  letter-spacing: 0.02em;
}

.logo-text span { color: var(--orange); }

.header-divider {
  width: 1px; height: 24px;
  background: var(--border);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 2px;
  font-family: var(--mono);
  font-size: 11px;
  border: 1px solid;
}

.pill-green { background: var(--green-bg); border-color: var(--green-dim); color: var(--green); }
.pill-orange { background: var(--orange-bg); border-color: var(--orange-dim); color: var(--orange); }
.pill-red { background: var(--red-bg); border-color: var(--red-dim); color: var(--red); }
.pill-blue { background: var(--blue-bg); border-color: var(--blue-dim); color: var(--blue); }
.pill-muted { background: var(--bg2); border-color: var(--border); color: var(--muted); }

.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot-green { background: var(--green); }
.dot-orange { background: var(--orange); box-shadow: 0 0 6px var(--orange); }

@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
.pulse { animation: pulse 2s ease-in-out infinite; }

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.clock { color: var(--text); font-size: 12px; }

.nav-tabs {
  background: var(--bg1);
  border-bottom: 1px solid var(--border);
  padding: 0 28px;
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.nav-tab {
  padding: 11px 18px;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  gap: 7px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.nav-tab:hover { color: var(--text); }
.nav-tab.active { color: var(--orange); border-bottom-color: var(--orange); }

.main { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }

.card {
  background: var(--bg1);
  border: 1px solid var(--border);
  border-radius: 3px;
}

.card-header {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-bright);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.card-meta {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.card-body { padding: 18px; }
.card-body-0 { padding: 0; }

.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

.stat-item {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 16px 18px;
}

.stat-label { font-size: 11px; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.stat-value { font-size: 26px; font-weight: 700; line-height: 1; color: var(--text-bright); margin-bottom: 4px; }
.stat-sub { font-family: var(--mono); font-size: 10px; color: var(--dim); }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.grid-3 { display: grid; grid-template-columns: 3fr 2fr; gap: 20px; }

.data-table { width: 100%; border-collapse: collapse; }

.data-table th {
  text-align: left;
  padding: 9px 16px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dim);
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}

.data-table td {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--muted);
  border-bottom: 1px solid rgba(44,46,38,0.6);
  vertical-align: middle;
}

.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: var(--bg2); color: var(--text); }
.data-table td.bright { color: var(--text-bright); font-weight: 500; }
.data-table td.mono { font-family: var(--mono); font-size: 11px; }

.perm {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 2px;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.05em;
}
.perm-server { background: var(--orange-bg); border: 1px solid var(--orange-dim); color: var(--orange); }
.perm-admin { background: var(--blue-bg); border: 1px solid var(--blue-dim); color: var(--blue); }
.perm-operator { background: var(--green-bg); border: 1px solid var(--green-dim); color: var(--green); }
.perm-client { background: var(--bg2); border: 1px solid var(--border); color: var(--muted); }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 2px;
  border: 1px solid;
  transition: all 0.12s;
  white-space: nowrap;
}

.btn-primary { border-color: var(--orange-dim); color: var(--orange); background: var(--orange-bg); }
.btn-primary:hover { background: rgba(217,122,48,0.15); border-color: var(--orange); }
.btn-danger { border-color: var(--red-dim); color: var(--red); background: var(--red-bg); }
.btn-danger:hover { background: rgba(201,85,85,0.14); border-color: var(--red); }
.btn-ghost { border-color: var(--border); color: var(--muted); background: transparent; }
.btn-ghost:hover { border-color: var(--border2); color: var(--text); background: var(--bg2); }
.btn-green { border-color: var(--green-dim); color: var(--green); background: var(--green-bg); }
.btn-green:hover { background: rgba(124,184,122,0.14); }
.btn-sm { padding: 4px 10px; font-size: 11px; }
.btn-xs { padding: 2px 8px; font-size: 10px; }
.btn-group { display: flex; gap: 6px; flex-wrap: wrap; }

.log-container {
  background: var(--bg0);
  border: 1px solid var(--border);
  border-radius: 2px;
  max-height: 260px;
  overflow-y: auto;
}

.log-entry {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 14px;
  border-left: 2px solid transparent;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
}

.log-entry:hover { background: var(--bg2); }
.log-entry.log-join { border-color: var(--green); }
.log-entry.log-leave { border-color: var(--dim); }
.log-entry.log-cmd { border-color: var(--blue); }
.log-entry.log-warn { border-color: var(--orange); }
.log-entry.log-ban { border-color: var(--red); }
.log-entry.log-save { border-color: var(--muted); }

.log-time { color: var(--dim); flex-shrink: 0; width: 60px; }
.log-tag { flex-shrink: 0; width: 48px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
.log-tag.join { color: var(--green); }
.log-tag.leave { color: var(--muted); }
.log-tag.cmd { color: var(--blue); }
.log-tag.warn { color: var(--orange); }
.log-tag.ban { color: var(--red); }
.log-tag.save { color: var(--muted); }
.log-msg { color: var(--muted); flex: 1; }

.console-out {
  background: var(--bg0);
  border: 1px solid var(--border);
  border-radius: 2px;
  height: 340px;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.c-line { font-family: var(--mono); font-size: 12px; line-height: 1.7; }
.c-comment { color: var(--dim); }
.c-input { color: var(--orange); }
.c-ok { color: var(--green); }
.c-err { color: var(--red); }
.c-info { color: var(--muted); }

.console-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  background: var(--bg0);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 8px 14px;
}

.c-prompt { font-family: var(--mono); font-size: 12px; color: var(--orange); flex-shrink: 0; }
.c-field {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-bright);
  caret-color: var(--orange);
}

.setting-group-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--dim);
  padding: 14px 18px 6px;
  border-top: 1px solid var(--border);
}

.setting-group-label:first-child { border-top: none; }

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 18px;
  gap: 20px;
  border-bottom: 1px solid rgba(44,46,38,0.5);
}

.setting-row:last-child { border-bottom: none; }
.setting-row:hover { background: var(--bg2); }

.setting-info { flex: 1; min-width: 0; }
.setting-name { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 2px; }
.setting-key { font-family: var(--mono); font-size: 10px; color: var(--dim); }
.setting-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }

.toggle-wrap { display: flex; align-items: center; gap: 8px; }

.toggle {
  width: 36px; height: 20px;
  border-radius: 10px;
  background: var(--bg3);
  border: 1px solid var(--border2);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  flex-shrink: 0;
}
.toggle.on { background: var(--green-bg); border-color: var(--green-dim); }
.toggle::after {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--dim);
  top: 2px; left: 2px;
  transition: all 0.2s;
}
.toggle.on::after { left: 18px; background: var(--green); box-shadow: 0 0 5px var(--green); }

.num-input, .sel-input {
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 2px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  padding: 5px 9px;
  outline: none;
  transition: border-color 0.15s;
}
.num-input { width: 90px; }
.num-input:focus, .sel-input:focus { border-color: var(--orange); }

.text-input {
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 2px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  padding: 5px 9px;
  outline: none;
  width: 200px;
  transition: border-color 0.15s;
}
.text-input:focus { border-color: var(--orange); }

.json-pane {
  background: var(--bg0);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 16px;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.9;
  overflow-y: auto;
  max-height: 600px;
}
.jk { color: #7cb8d0; }
.js { color: var(--green); }
.jn { color: var(--orange); }
.jb { color: #b59cdf; }
.jd { color: var(--dim); }

.quick-cmd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(44,46,38,0.5);
  gap: 10px;
  transition: background 0.1s;
}
.quick-cmd:last-child { border-bottom: none; }
.quick-cmd:hover { background: var(--bg2); }
.qc-cmd { font-family: var(--mono); font-size: 11px; color: var(--blue); }
.qc-desc { font-size: 11px; color: var(--dim); flex: 1; text-align: right; }

.warn-banner {
  background: var(--orange-bg);
  border: 1px solid var(--orange-dim);
  border-left: 3px solid var(--orange);
  border-radius: 2px;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--orange);
  display: flex;
  align-items: center;
  gap: 10px;
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--bg0); }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }

.spacer { flex: 1; }
@keyframes fadein { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
.fadein { animation: fadein 0.2s ease forwards; }
.row { display: flex; align-items: center; gap: 10px; }
.col { display: flex; flex-direction: column; gap: 10px; }
.mono { font-family: var(--mono); }
`;

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const pad = n => String(n).padStart(2, "0");
  return <span className="clock mono">{pad(t.getHours())}:{pad(t.getMinutes())}:{pad(t.getSeconds())} UTC</span>;
}

const mockPlayers = [
  { steam: "76561198001234567", name: "SurvivorMike", perm: "server", online: true, playtime: "14h 32m", location: "Pine Forest" },
  { steam: "76561198009876543", name: "Wanderer_K", perm: "admin", online: true, playtime: "6h 10m", location: "Desert" },
  { steam: "76561198012345678", name: "NomadRex", perm: "operator", online: true, playtime: "2h 55m", location: "Ruins" },
  { steam: "76561198087654321", name: "delta_scout", perm: "client", online: true, playtime: "0h 47m", location: "Wetlands" },
  { steam: "76561198055555555", name: "IronCraft99", perm: "client", online: false, playtime: "22h 04m", location: "—" },
  { steam: "76561198033333333", name: "ghost_loop", perm: "client", online: true, playtime: "1h 18m", location: "Tundra" },
];

const mockLog = [
  { time: "14:38:04", type: "join", msg: "ghost_loop connected [76561198033333333]" },
  { time: "14:37:50", type: "save", msg: "World auto-saved (SaveInterval: 120s)" },
  { time: "14:37:10", type: "cmd", msg: "Wanderer_K: setweather stormy" },
  { time: "14:36:45", type: "warn", msg: "Server memory usage high (82%)" },
  { time: "14:36:01", type: "cmd", msg: "SurvivorMike: announcement Server restarting in 10 min" },
  { time: "14:35:33", type: "leave", msg: "IronCraft99 disconnected — user quit" },
  { time: "14:34:12", type: "cmd", msg: "NomadRex: heal 76561198087654321" },
  { time: "14:33:58", type: "join", msg: "delta_scout connected [76561198087654321]" },
  { time: "14:32:40", type: "ban", msg: "Wanderer_K: ban 76561197999000111 — Cheating" },
  { time: "14:31:00", type: "save", msg: "World auto-saved (SaveInterval: 120s)" },
];

const mockBans = [
  { steam: "76561197999000111", name: "xAimbotUserx", by: "Wanderer_K", date: "2026-02-21", reason: "Cheating — aimbot suspected" },
  { steam: "76561197888000222", name: "GrieferBoss", by: "SurvivorMike", date: "2026-02-18", reason: "Excessive griefing / base spam" },
  { steam: "76561197777000333", name: "chat_spammer", by: "Wanderer_K", date: "2026-02-15", reason: "Spam / advertising" },
];

const mockWhitelist = [
  { steam: "76561198001234567", name: "SurvivorMike", added: "2026-02-10" },
  { steam: "76561198009876543", name: "Wanderer_K", added: "2026-02-10" },
  { steam: "76561198044444444", name: "PlaytestUser01", added: "2026-02-20" },
];

const settingGroups = [
  {
    label: "General",
    settings: [
      { key: "WorldName", name: "World Name", desc: "Save name for this world", type: "text", value: "My Survival World" },
      { key: "SaveInterval", name: "Save Interval", desc: "How often the world auto-saves (seconds)", type: "number", value: 120 },
      { key: "IsHardcore", name: "Hardcore Mode", desc: "Enable unforgiving Hardcore rules", type: "bool", value: false },
      { key: "GameType", name: "Game Type", desc: "Cooperative (PvE focused), PVP, Creative, or Arena", type: "select", value: "ServerType.Cooperative", options: ["ServerType.Cooperative","ServerType.PVP","ServerType.Creative","ServerType.Arena"] },
      { key: "Description", name: "Server Description", desc: "Shown in the server browser", type: "text", value: "A community survival server" },
      { key: "IsOnline", name: "Visible in Browser", desc: "Allow players to find server in server browser", type: "bool", value: true },
      { key: "IsWhitelisted", name: "Whitelisted", desc: "Restrict joins to players in whitelist.txt", type: "bool", value: false },
      { key: "FriendsOnly", name: "Friends Only", desc: "Only Steam friends can join", type: "bool", value: false },
      { key: "MaxPlayers", name: "Max Players", desc: "Maximum concurrent player slots", type: "number", value: 16 },
      { key: "WorldOvergrowth", name: "World Overgrowth", desc: "0 = fresh apocalypse · 1 = years in (affects loot scarcity & decay)", type: "number", value: 0.4 },
    ],
  },
  {
    label: "Map",
    settings: [
      { key: "LimitMapSize", name: "Limit Map Size", desc: "Add a world border — disabled = infinite world", type: "bool", value: false },
      { key: "MapSizeLimit", name: "Map Size Limit", desc: "Border-to-border size in units when limiting is on", type: "number", value: 4000 },
      { key: "SpawnRegionSize", name: "Spawn Region Size", desc: "Radius players can respawn within", type: "number", value: 500 },
    ],
  },
];

const consoleInit = [
  { cls: "c-comment", text: "# ORMOD: Directive — Server Console" },
  { cls: "c-comment", text: "# World: My Survival World  |  SteamCMD Dedicated Server" },
  { cls: "c-comment", text: "# Permissions: [server] > [admin] > [operator] > [client]" },
  { cls: "c-comment", text: "#" },
  { cls: "c-info", text: "  getplayers" },
  { cls: "c-ok", text: "  [6] SurvivorMike · Wanderer_K · NomadRex · delta_scout · ghost_loop + 1 offline" },
  { cls: "c-info", text: "  getserversettings" },
  { cls: "c-ok", text: "  GameType: Cooperative | MaxPlayers: 16 | IsHardcore: false | WorldOvergrowth: 0.4" },
  { cls: "c-info", text: "  announcement Welcome to the server! Please read the rules in Discord." },
  { cls: "c-ok", text: "  [OK] Announcement sent to all players." },
];

const quickCmds = [
  { cmd: "getplayers", desc: "List all players", perm: "operator" },
  { cmd: "getserversettings", desc: "Show current settings", perm: "admin" },
  { cmd: "forcesave", desc: "Force world save", perm: "server" },
  { cmd: "announcement [msg]", desc: "Broadcast to all players", perm: "operator" },
  { cmd: "settime [0000-2400]", desc: "Set world time", perm: "admin" },
  { cmd: "setweather [type]", desc: "cloudy / stormy / clear / lightrain etc.", perm: "admin" },
  { cmd: "setfog [true/false]", desc: "Toggle world fog", perm: "admin" },
  { cmd: "kick [steamId]", desc: "Kick a player", perm: "operator" },
  { cmd: "ban [steamId]", desc: "Ban a player", perm: "admin" },
  { cmd: "unban [steamId]", desc: "Unban a player", perm: "admin" },
  { cmd: "whitelist [steamId]", desc: "Add to whitelist.txt", perm: "admin" },
  { cmd: "teleport [steamId]", desc: "Teleport self to player", perm: "admin" },
  { cmd: "heal [steamId]", desc: "Reset all player stats", perm: "operator" },
  { cmd: "addxp [steamId] [amt]", desc: "Give XP to a player", perm: "operator" },
  { cmd: "spawn [entity]", desc: "Spawn entity at position", perm: "admin" },
  { cmd: "setpermissions [id] [lvl]", desc: "Set player permission level", perm: "server" },
  { cmd: "authenabled [true/false]", desc: "Toggle server-side auth", perm: "server" },
  { cmd: "anticheatenabled [true/false]", desc: "Toggle anti-cheat system", perm: "server" },
  { cmd: "forcerespawnloot", desc: "Force respawn all loot pools", perm: "admin" },
];

/* ──────────────── DASHBOARD ──────────────── */
function Dashboard() {
  const online = mockPlayers.filter(p => p.online).length;
  return (
    <div className="main fadein">
      <div className="stat-row">
        <div className="stat-item">
          <div className="stat-label">Players Online</div>
          <div className="stat-value">{online}</div>
          <div className="stat-sub">of 16 max slots</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Game Type</div>
          <div className="stat-value" style={{fontSize:"16px",paddingTop:"6px",color:"var(--orange)"}}>Cooperative</div>
          <div className="stat-sub">ServerType.Cooperative</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">World Overgrowth</div>
          <div className="stat-value">0.4</div>
          <div className="stat-sub">Mid-apocalypse decay</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Last Save</div>
          <div className="stat-value" style={{fontSize:"18px",paddingTop:"4px"}}>2m ago</div>
          <div className="stat-sub">Auto-save: 120s interval</div>
        </div>
      </div>

      <div className="warn-banner">
        ⚠ Server memory usage is high (82%). Run <span className="mono" style={{margin:"0 4px",color:"var(--text)"}}>forcesave</span> and consider scheduling a restart.
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity Log</span>
            <span className="pill pill-green"><span className="dot dot-green pulse"></span>Live</span>
          </div>
          <div style={{background:"var(--bg0)"}}>
            {mockLog.map((l, i) => (
              <div key={i} className={`log-entry log-${l.type}`}>
                <span className="log-time">{l.time}</span>
                <span className={`log-tag ${l.type}`}>{l.type.toUpperCase()}</span>
                <span className="log-msg">{l.msg}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Online Players</span>
              <span className="card-meta">{online} active</span>
            </div>
            <div className="card-body-0">
              {mockPlayers.filter(p => p.online).map((p, i) => (
                <div key={i} className="setting-row" style={{padding:"10px 16px"}}>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:"500",color:"var(--text-bright)"}}>{p.name}</div>
                    <div style={{fontFamily:"var(--mono)",fontSize:"10px",color:"var(--dim)",marginTop:"2px"}}>{p.steam.slice(0,15)}…</div>
                  </div>
                  <div className="col" style={{alignItems:"flex-end",gap:"4px"}}>
                    <span className={`perm perm-${p.perm}`}>[{p.perm}]</span>
                    <span style={{fontSize:"10px",color:"var(--muted)"}}>{p.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Quick Actions</span></div>
            <div className="card-body">
              <div className="btn-group">
                <button className="btn btn-primary btn-sm">Force Save</button>
                <button className="btn btn-ghost btn-sm">Announcement</button>
                <button className="btn btn-ghost btn-sm">Set Weather</button>
                <button className="btn btn-danger btn-sm">Kick All</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── PLAYERS ──────────────── */
function Players() {
  const [active, setActive] = useState(null);
  return (
    <div className="main fadein">
      <div className="row" style={{marginBottom:"4px"}}>
        <div>
          <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text-bright)"}}>Player Management</div>
          <div style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
            adminlist.txt · setpermissions · kick · ban · whitelist
          </div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-ghost btn-sm">Refresh</button>
        <button className="btn btn-primary btn-sm">Broadcast</button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Players</span>
          <span className="card-meta">
            {mockPlayers.filter(p=>p.online).length} online · {mockPlayers.filter(p=>!p.online).length} offline
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Steam ID</th>
              <th>Permission</th>
              <th>Status</th>
              <th>Play Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockPlayers.map((p, i) => (
              <>
                <tr key={i} onClick={() => setActive(active === i ? null : i)} style={{cursor:"pointer"}}>
                  <td className="bright">{p.name}</td>
                  <td className="mono">{p.steam}</td>
                  <td><span className={`perm perm-${p.perm}`}>[{p.perm}]</span></td>
                  <td>
                    {p.online
                      ? <span className="pill pill-green"><span className="dot dot-green pulse"></span>Online</span>
                      : <span className="pill pill-muted">Offline</span>}
                  </td>
                  <td className="mono">{p.playtime}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="btn-group">
                      <button className="btn btn-ghost btn-xs">Teleport</button>
                      <button className="btn btn-ghost btn-xs">Heal</button>
                      <button className="btn btn-danger btn-xs">Kick</button>
                      <button className="btn btn-danger btn-xs">Ban</button>
                    </div>
                  </td>
                </tr>
                {active === i && (
                  <tr key={`exp-${i}`}>
                    <td colSpan={6} style={{padding:"0",background:"var(--bg2)"}}>
                      <div style={{padding:"16px 20px"}}>
                        <div className="row" style={{marginBottom:"12px"}}>
                          <span style={{fontWeight:"600",color:"var(--text-bright)"}}>{p.name}</span>
                          <span style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--muted)"}}>{p.steam}</span>
                        </div>
                        <div className="row" style={{gap:"12px",flexWrap:"wrap",marginBottom:"14px"}}>
                          {[
                            ["Permission", <span className={`perm perm-${p.perm}`}>[{p.perm}]</span>],
                            ["Biome / Location", p.location],
                            ["Session Time", p.playtime],
                            ["Status", p.online ? "Online" : "Offline"],
                          ].map(([label, val]) => (
                            <div key={label} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"2px",padding:"10px 16px",minWidth:"130px"}}>
                              <div className="stat-label">{label}</div>
                              <div style={{fontSize:"13px",color:"var(--text)",marginTop:"2px"}}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div className="btn-group">
                          <button className="btn btn-ghost btn-sm">Set Permission</button>
                          <button className="btn btn-ghost btn-sm">Teleport To</button>
                          <button className="btn btn-ghost btn-sm">Add XP</button>
                          <button className="btn btn-ghost btn-sm">Heal</button>
                          <button className="btn btn-ghost btn-sm">Godmode</button>
                          <button className="btn btn-ghost btn-sm">Spectate</button>
                          <button className="btn btn-primary btn-sm">Whitelist</button>
                          <button className="btn btn-danger btn-sm">Kick</button>
                          <button className="btn btn-danger btn-sm">Ban</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────── SETTINGS ──────────────── */
function Settings() {
  const [vals, setVals] = useState(
    settingGroups.flatMap(g => g.settings).reduce((a, s) => ({ ...a, [s.key]: s.value }), {})
  );
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setVals(p => ({ ...p, [k]: v })); setSaved(false); };

  return (
    <div className="main fadein">
      <div className="row" style={{marginBottom:"4px"}}>
        <div>
          <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text-bright)"}}>Server Settings</div>
          <div style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
            serversettings.json · setserversetting [key] [value] · live reload
          </div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-ghost btn-sm">Reload from File</button>
        <button className="btn btn-primary btn-sm" onClick={() => setSaved(true)}>
          {saved ? "✓ Saved" : "Save to JSON"}
        </button>
      </div>

      <div className="grid-2" style={{alignItems:"start"}}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Parameters</span>
            <span className="pill pill-green"><span className="dot dot-green pulse"></span>Live Reload Active</span>
          </div>
          <div className="card-body-0">
            {settingGroups.map(g => (
              <div key={g.label}>
                <div className="setting-group-label">{g.label}</div>
                {g.settings.map(s => (
                  <div key={s.key} className="setting-row">
                    <div className="setting-info">
                      <div className="setting-name">{s.name}</div>
                      <div className="setting-key">{s.key}</div>
                      <div className="setting-desc">{s.desc}</div>
                    </div>
                    <div>
                      {s.type === "bool" && (
                        <div className="toggle-wrap">
                          <span style={{fontFamily:"var(--mono)",fontSize:"11px",color:vals[s.key]?"var(--green)":"var(--dim)"}}>
                            {vals[s.key] ? "true" : "false"}
                          </span>
                          <div className={`toggle ${vals[s.key] ? "on" : ""}`} onClick={() => set(s.key, !vals[s.key])} />
                        </div>
                      )}
                      {s.type === "number" && (
                        <input className="num-input" type="number" value={vals[s.key]}
                          onChange={e => set(s.key, parseFloat(e.target.value))} />
                      )}
                      {s.type === "select" && (
                        <select className="sel-input" value={vals[s.key]}
                          onChange={e => set(s.key, e.target.value)}>
                          {s.options.map(o => <option key={o}>{o}</option>)}
                        </select>
                      )}
                      {s.type === "text" && (
                        <input className="text-input" type="text" value={vals[s.key]}
                          onChange={e => set(s.key, e.target.value)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{position:"sticky",top:"16px"}}>
          <div className="card-header">
            <span className="card-title">serversettings.json</span>
            <span className="card-meta">Live Preview</span>
          </div>
          <div className="card-body-0">
            <div className="json-pane">
              <span className="jd">{"{"}</span><br/>
              {settingGroups.flatMap(g => g.settings).map(s => (
                <div key={s.key} style={{paddingLeft:"16px"}}>
                  <span className="jk">"{s.key}"</span>
                  <span className="jd">: </span>
                  {s.type === "bool"
                    ? <span className="jb">{String(vals[s.key])}</span>
                    : s.type === "number"
                    ? <span className="jn">{vals[s.key]}</span>
                    : <span className="js">"{vals[s.key]}"</span>}
                  <span className="jd">,</span>
                </div>
              ))}
              <span className="jd">{"}"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── CONSOLE ──────────────── */
function Console() {
  const [lines, setLines] = useState(consoleInit);
  const [input, setInput] = useState("");
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  const run = () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setLines(l => [
      ...l,
      { cls: "c-input", text: `  ${cmd}` },
      { cls: "c-ok", text: "  [OK] Command dispatched to server process." },
    ]);
    setHist(h => [cmd, ...h]);
    setHi(-1);
    setInput("");
  };

  return (
    <div className="main fadein">
      <div className="row" style={{marginBottom:"4px"}}>
        <div>
          <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text-bright)"}}>Console</div>
          <div style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
            Direct CLI access · Commands dispatched via server process stdin
          </div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([{cls:"c-comment",text:"# Console cleared."}])}>
          Clear
        </button>
      </div>

      <div className="grid-3">
        <div className="col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Terminal</span>
              <span className="pill pill-green"><span className="dot dot-green pulse"></span>Connected</span>
            </div>
            <div className="card-body">
              <div className="console-out">
                {lines.map((l, i) => <div key={i} className={`c-line ${l.cls}`}>{l.text || "\u00A0"}</div>)}
                <div ref={endRef}/>
              </div>
              <div className="console-input-row">
                <span className="c-prompt">$</span>
                <input
                  className="c-field"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") run();
                    if (e.key === "ArrowUp") { const n = Math.min(hi+1,hist.length-1); setHi(n); setInput(hist[n]||""); }
                    if (e.key === "ArrowDown") { const n = Math.max(hi-1,-1); setHi(n); setInput(n<0?"":hist[n]); }
                  }}
                  placeholder="type a command..."
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={run}>Run</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{alignSelf:"start"}}>
          <div className="card-header"><span className="card-title">Quick Commands</span></div>
          <div className="card-body-0" style={{maxHeight:"460px",overflowY:"auto"}}>
            {quickCmds.map((q, i) => (
              <div key={i} className="quick-cmd" onClick={() => setInput(q.cmd + " ")}>
                <span className={`perm perm-${q.perm}`} style={{flexShrink:0}}>[{q.perm}]</span>
                <span className="qc-cmd">{q.cmd}</span>
                <span className="qc-desc">{q.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── WIPE MANAGER ──────────────── */
const wipeHistory = [
  { id: 1, type: "MAP_ONLY", by: "SurvivorMike", date: "2026-02-10 06:00", notes: "Bi-weekly map wipe", backup: true, success: true },
  { id: 2, type: "MAP_ONLY", by: "Auto-Scheduler", date: "2026-01-27 06:00", notes: "Scheduled wipe", backup: true, success: true },
  { id: 3, type: "FULL", by: "SurvivorMike", date: "2026-01-01 00:00", notes: "New Year full wipe", backup: true, success: true },
];

const wipeFiles = [
  { label: "ChunkData/", desc: "All world chunk files", checked: true, critical: true },
  { label: "RegionData/", desc: "Region spawn data", checked: true, critical: true },
  { label: "mapdata.json", desc: "Map metadata", checked: true, critical: false },
  { label: "entitydata.json", desc: "All placed entities", checked: true, critical: false },
  { label: "networkentities.json", desc: "Workbenches, vehicles, mechanoids", checked: true, critical: false },
  { label: "buildareas.json", desc: "Build location data", checked: true, critical: false },
  { label: "structuredata.dat", desc: "POI structure data", checked: true, critical: false },
  { label: "pathfindingdata.dat", desc: "AI pathfinding cache", checked: true, critical: false },
  { label: "loottables.json", desc: "Loot respawn state", checked: true, critical: false },
  { label: "weatherdata.dat", desc: "Weather & fog state", checked: true, critical: false },
  { label: "worldregrowth.json", desc: "Foliage regrowth data", checked: true, critical: false },
  { label: "PlayerData/", desc: "All player save files", checked: false, critical: true },
  { label: "spawnregion.dat", desc: "Spawn region data", checked: false, critical: false },
  { label: "log.txt", desc: "Server log file", checked: false, critical: false },
];

function WipeManager() {
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [createBackup, setCreateBackup] = useState(true);
  const [restartAfter, setRestartAfter] = useState(true);
  const [files, setFiles] = useState(wipeFiles);
  const [tab, setTab] = useState("quick");

  const SERVER_NAME = "My Survival World";

  const wipeTypes = [
    {
      id: "MAP_ONLY",
      label: "Map Wipe",
      color: "btn-primary",
      icon: "◫",
      desc: "Deletes all world, chunk, and entity data. Player inventories and stats are preserved. Use for regular wipe days.",
      deletes: ["ChunkData/", "RegionData/", "mapdata.json", "entitydata.json", "networkentities.json", "buildareas.json", "structuredata.dat", "loottables.json", "weatherdata.dat", "worldregrowth.json"],
      keeps: ["PlayerData/", "banlist.txt", "whitelist.txt", "adminlist.txt", "serversettings.json"],
    },
    {
      id: "MAP_PLAYERS",
      label: "Map + Players",
      color: "btn-warn-custom",
      icon: "◫",
      desc: "Deletes world data AND player data. Players lose their inventories and progress. Keeps access lists and settings.",
      deletes: ["ChunkData/", "RegionData/", "PlayerData/", "mapdata.json", "entitydata.json", "networkentities.json"],
      keeps: ["banlist.txt", "whitelist.txt", "adminlist.txt", "serversettings.json"],
    },
    {
      id: "FULL",
      label: "Full Wipe",
      color: "btn-danger",
      icon: "⊠",
      desc: "Deletes everything except access lists and server settings. Complete fresh start — use sparingly.",
      deletes: ["ChunkData/", "RegionData/", "PlayerData/", "ALL world files", "log.txt"],
      keeps: ["banlist.txt", "whitelist.txt", "adminlist.txt", "serversettings.json"],
    },
  ];

  const chosen = wipeTypes.find(w => w.id === pendingType);

  return (
    <div className="main fadein">
      <div className="row" style={{marginBottom:"4px"}}>
        <div>
          <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text-bright)"}}>Wipe Manager</div>
          <div style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
            Stop server → backup → delete files → restart
          </div>
        </div>
        <div className="spacer"/>
        <div className="btn-group">
          <button onClick={() => setTab("quick")} className={`btn btn-sm ${tab==="quick"?"btn-primary":"btn-ghost"}`}>Quick Wipe</button>
          <button onClick={() => setTab("custom")} className={`btn btn-sm ${tab==="custom"?"btn-primary":"btn-ghost"}`}>Custom Wipe</button>
          <button onClick={() => setTab("history")} className={`btn btn-sm ${tab==="history"?"btn-primary":"btn-ghost"}`}>History</button>
          <button onClick={() => setTab("schedule")} className={`btn btn-sm ${tab==="schedule"?"btn-primary":"btn-ghost"}`}>Schedule</button>
        </div>
      </div>

      <div className="warn-banner">
        ⚠ Wipes are <strong style={{margin:"0 4px"}}>irreversible</strong>. The server will be stopped before any wipe executes. Always keep backups enabled.
      </div>

      {tab === "quick" && (
        <div className="fadein">
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"16px"}}>
            {wipeTypes.map(wt => (
              <div key={wt.id} className="card">
                <div className="card-header">
                  <span className="card-title" style={{
                    color: wt.id==="FULL" ? "var(--red)" : wt.id==="MAP_PLAYERS" ? "var(--orange)" : "var(--blue)"
                  }}>{wt.label}</span>
                </div>
                <div className="card-body" style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                  <div style={{fontSize:"13px",color:"var(--muted)",lineHeight:"1.6"}}>{wt.desc}</div>

                  <div>
                    <div style={{fontSize:"10px",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--dim)",marginBottom:"6px"}}>Deletes</div>
                    {wt.deletes.slice(0,4).map(f => (
                      <div key={f} style={{display:"flex",alignItems:"center",gap:"6px",padding:"2px 0",fontFamily:"var(--mono)",fontSize:"10px",color:"var(--red)"}}>
                        <span>✕</span><span>{f}</span>
                      </div>
                    ))}
                    {wt.deletes.length > 4 && <div style={{fontFamily:"var(--mono)",fontSize:"10px",color:"var(--dim)"}}>+{wt.deletes.length-4} more…</div>}
                  </div>

                  <div>
                    <div style={{fontSize:"10px",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--dim)",marginBottom:"6px"}}>Keeps</div>
                    {wt.keeps.map(f => (
                      <div key={f} style={{display:"flex",alignItems:"center",gap:"6px",padding:"2px 0",fontFamily:"var(--mono)",fontSize:"10px",color:"var(--green)"}}>
                        <span>✓</span><span>{f}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    className={`btn ${wt.id==="FULL" ? "btn-danger" : wt.id==="MAP_PLAYERS" ? "btn-primary" : "btn-primary"}`}
                    onClick={() => { setPendingType(wt.id); setShowConfirm(true); setConfirmText(""); }}
                  >
                    Execute {wt.label} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "custom" && (
        <div className="fadein">
          <div className="grid-2" style={{alignItems:"start"}}>
            <div className="card">
              <div className="card-header"><span className="card-title">Select Files to Delete</span></div>
              <div className="card-body-0">
                {files.map((f, i) => (
                  <div key={f.label} className="setting-row" style={{padding:"10px 18px",cursor:"pointer"}}
                    onClick={() => setFiles(prev => prev.map((p, j) => j===i ? {...p, checked: !p.checked} : p))}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",flex:1}}>
                      <div style={{
                        width:"16px",height:"16px",border:`1px solid ${f.checked?"var(--red)":"var(--border2)"}`,
                        background: f.checked ? "var(--red-bg)" : "var(--bg3)",
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0
                      }}>
                        {f.checked && <span style={{color:"var(--red)",fontSize:"10px"}}>✕</span>}
                      </div>
                      <div>
                        <div style={{fontFamily:"var(--mono)",fontSize:"12px",color: f.checked?"var(--red)":"var(--muted)"}}>{f.label}</div>
                        <div style={{fontSize:"11px",color:"var(--dim)"}}>{f.desc}</div>
                      </div>
                    </div>
                    {f.critical && <span className="pill pill-red" style={{fontSize:"9px",padding:"1px 6px"}}>critical</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="col">
              <div className="card">
                <div className="card-header"><span className="card-title">Options</span></div>
                <div className="card-body-0">
                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-name">Create Backup</div>
                      <div className="setting-desc">tar.gz archive of entire save dir before wiping</div>
                    </div>
                    <div className={`toggle ${createBackup?"on":""}`} onClick={() => setCreateBackup(p => !p)} />
                  </div>
                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-name">Restart After Wipe</div>
                      <div className="setting-desc">Automatically start server when complete</div>
                    </div>
                    <div className={`toggle ${restartAfter?"on":""}`} onClick={() => setRestartAfter(p => !p)} />
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Summary</span></div>
                <div className="card-body">
                  <div style={{marginBottom:"10px",fontSize:"12px",color:"var(--muted)"}}>
                    <strong style={{color:"var(--red)"}}>{files.filter(f=>f.checked).length}</strong> items selected for deletion.
                  </div>
                  {files.filter(f=>f.checked).map(f => (
                    <div key={f.label} style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--red)",padding:"1px 0"}}>✕ {f.label}</div>
                  ))}
                  <button className="btn btn-danger" style={{marginTop:"16px",width:"100%"}}
                    onClick={() => { setPendingType("CUSTOM"); setShowConfirm(true); setConfirmText(""); }}>
                    Execute Custom Wipe →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card fadein">
          <div className="card-header"><span className="card-title">Wipe History</span></div>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Triggered By</th><th>Date</th><th>Notes</th><th>Backup</th><th>Status</th></tr></thead>
            <tbody>
              {wipeHistory.map(w => (
                <tr key={w.id}>
                  <td><span className={`perm ${w.type==="FULL"?"perm-server":w.type==="MAP_PLAYERS"?"perm-admin":"perm-operator"}`}>{w.type}</span></td>
                  <td className="bright">{w.by}</td>
                  <td className="mono" style={{color:"var(--dim)"}}>{w.date}</td>
                  <td style={{color:"var(--muted)"}}>{w.notes}</td>
                  <td>{w.backup ? <span className="pill pill-green" style={{fontSize:"10px"}}>✓ Available</span> : <span style={{color:"var(--dim)"}}>—</span>}</td>
                  <td><span className="pill pill-green" style={{fontSize:"10px"}}>Success</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "schedule" && (
        <div className="fadein">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Scheduled Wipes</span>
              <button className="btn btn-primary btn-sm">+ Add Schedule</button>
            </div>
            <div style={{padding:"20px 18px"}}>
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"3px",padding:"16px 20px",marginBottom:"16px"}}>
                <div className="row" style={{marginBottom:"10px"}}>
                  <span style={{fontWeight:"600",color:"var(--text-bright)"}}>Weekly Map Wipe</span>
                  <span className="pill pill-green" style={{fontSize:"10px"}}>Enabled</span>
                  <div className="spacer"/>
                  <button className="btn btn-ghost btn-xs">Edit</button>
                  <button className="btn btn-danger btn-xs">Delete</button>
                </div>
                <div className="row" style={{gap:"20px",flexWrap:"wrap"}}>
                  {[
                    ["Cron", "0 6 * * 1"],
                    ["Schedule", "Every Monday at 06:00 UTC"],
                    ["Type", "MAP_ONLY"],
                    ["Next Run", "Mon 2026-02-25 06:00"],
                    ["Last Run", "Mon 2026-02-10 06:00"],
                  ].map(([k,v]) => (
                    <div key={k}>
                      <div style={{fontSize:"10px",color:"var(--dim)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{k}</div>
                      <div style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--text)",marginTop:"2px"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{textAlign:"center",color:"var(--dim)",fontSize:"12px",padding:"20px"}}>
                + Add a scheduled wipe using cron expressions.<br/>
                Pre-wipe announcements are sent automatically at T-60min and T-5min.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ── */}
      {showConfirm && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:100
        }}>
          <div className="card fadein" style={{width:"480px",background:"var(--bg1)"}}>
            <div className="card-header" style={{borderColor:"var(--red-dim)"}}>
              <span className="card-title" style={{color:"var(--red)"}}>⚠ Confirm Wipe</span>
            </div>
            <div className="card-body" style={{display:"flex",flexDirection:"column",gap:"16px"}}>
              <div style={{fontSize:"13px",color:"var(--muted)",lineHeight:"1.6"}}>
                You are about to execute a <strong style={{color:"var(--text-bright)"}}>{pendingType}</strong> wipe on
                <strong style={{color:"var(--orange)"}}> {SERVER_NAME}</strong>.
                The server will be stopped first.
              </div>
              {chosen && (
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",padding:"12px",fontSize:"12px"}}>
                  <div style={{color:"var(--dim)",marginBottom:"6px",fontSize:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Files to be deleted</div>
                  {chosen.deletes.map(f => (
                    <div key={f} style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--red)",padding:"1px 0"}}>✕ {f}</div>
                  ))}
                </div>
              )}
              <div className="setting-row" style={{padding:"0"}}>
                <div className="setting-info">
                  <div className="setting-name">Create backup before wiping</div>
                </div>
                <div className={`toggle ${createBackup?"on":""}`} onClick={() => setCreateBackup(p => !p)} />
              </div>
              <div className="setting-row" style={{padding:"0"}}>
                <div className="setting-info">
                  <div className="setting-name">Restart server after wipe</div>
                </div>
                <div className={`toggle ${restartAfter?"on":""}`} onClick={() => setRestartAfter(p => !p)} />
              </div>
              <div>
                <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"6px"}}>
                  Type <strong style={{fontFamily:"var(--mono)",color:"var(--orange)"}}>{SERVER_NAME}</strong> to confirm
                </div>
                <input
                  className="text-input"
                  style={{width:"100%"}}
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={SERVER_NAME}
                />
              </div>
              <div className="btn-group" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-ghost" onClick={() => { setShowConfirm(false); setConfirmText(""); }}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  disabled={confirmText !== SERVER_NAME}
                  style={{opacity: confirmText === SERVER_NAME ? 1 : 0.4, cursor: confirmText === SERVER_NAME ? "pointer" : "not-allowed"}}
                  onClick={() => { setShowConfirm(false); setConfirmText(""); alert("Wipe executed! (mock)"); }}
                >
                  Execute Wipe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────── ACCESS CONTROL ──────────────── */
function AccessControl() {
  const [tab, setTab] = useState("bans");
  return (
    <div className="main fadein">
      <div className="row" style={{marginBottom:"4px"}}>
        <div>
          <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text-bright)"}}>Access Control</div>
          <div style={{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
            banlist.txt · whitelist.txt · adminlist.txt
          </div>
        </div>
        <div className="spacer"/>
        <div className="btn-group">
          <button onClick={() => setTab("bans")} className={`btn btn-sm ${tab==="bans"?"btn-danger":"btn-ghost"}`}>
            Ban List ({mockBans.length})
          </button>
          <button onClick={() => setTab("whitelist")} className={`btn btn-sm ${tab==="whitelist"?"btn-primary":"btn-ghost"}`}>
            Whitelist ({mockWhitelist.length})
          </button>
          <button onClick={() => setTab("admins")} className={`btn btn-sm ${tab==="admins"?"btn-green":"btn-ghost"}`}>
            Admin List
          </button>
        </div>
      </div>

      {tab === "bans" && (
        <div className="card fadein">
          <div className="card-header">
            <span className="card-title">banlist.txt</span>
            <button className="btn btn-primary btn-sm">+ Add Ban</button>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Steam ID</th><th>Reason</th><th>Banned By</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {mockBans.map((b, i) => (
                <tr key={i}>
                  <td className="bright">{b.name}</td>
                  <td className="mono">{b.steam}</td>
                  <td style={{color:"var(--muted)"}}>{b.reason}</td>
                  <td>{b.by}</td>
                  <td className="mono" style={{color:"var(--dim)"}}>{b.date}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-green btn-xs">Unban</button>
                      <button className="btn btn-ghost btn-xs">Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "whitelist" && (
        <div className="card fadein">
          <div className="card-header">
            <span className="card-title">whitelist.txt</span>
            <div className="row">
              <span className="pill pill-muted">IsWhitelisted: false</span>
              <button className="btn btn-primary btn-sm">+ Add Player</button>
            </div>
          </div>
          <div className="warn-banner" style={{borderRadius:"0",borderLeft:"none",borderRight:"none",borderTop:"none"}}>
            Whitelist is currently <strong style={{margin:"0 4px"}}>disabled</strong>. Enable via
            <span style={{fontFamily:"var(--mono)",margin:"0 5px",color:"var(--text)"}}>setserversetting IsWhitelisted true</span>
            or in Server Settings.
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Steam ID</th><th>Added</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {mockWhitelist.map((w, i) => (
                <tr key={i}>
                  <td className="bright">{w.name}</td>
                  <td className="mono">{w.steam}</td>
                  <td className="mono" style={{color:"var(--dim)"}}>{w.added}</td>
                  <td><button className="btn btn-danger btn-xs">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "admins" && (
        <div className="card fadein">
          <div className="card-header">
            <span className="card-title">adminlist.txt</span>
            <span className="card-meta">Format: SteamId:permission_level</span>
          </div>
          <div style={{padding:"14px 18px",borderBottom:"1px solid var(--border)",background:"var(--bg2)"}}>
            <div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"10px"}}>
              Permission levels (highest to lowest):&nbsp;
              <span className="perm perm-server">[server]</span>&nbsp;›&nbsp;
              <span className="perm perm-admin">[admin]</span>&nbsp;›&nbsp;
              <span className="perm perm-operator">[operator]</span>&nbsp;›&nbsp;
              <span className="perm perm-client">[client]</span>
            </div>
            <div className="btn-group">
              <button className="btn btn-primary btn-sm">+ Set Permission</button>
              <button className="btn btn-ghost btn-sm">Remove Permission</button>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Steam ID</th><th>Permission Level</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {mockPlayers.filter(p => p.perm !== "client").map((p, i) => (
                <tr key={i}>
                  <td className="bright">{p.name}</td>
                  <td className="mono">{p.steam}</td>
                  <td><span className={`perm perm-${p.perm}`}>[{p.perm}]</span></td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-ghost btn-xs">Change Level</button>
                      <button className="btn btn-danger btn-xs">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ──────────────── APP SHELL ──────────────── */
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "players", label: "Players", icon: "⌬" },
  { id: "settings", label: "Server Settings", icon: "⚙" },
  { id: "console", label: "Console", icon: ">" },
  { id: "access", label: "Access Control", icon: "⊘" },
  { id: "wipe", label: "Wipe Manager", icon: "⊠" },
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const online = mockPlayers.filter(p => p.online).length;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="header">
          <div className="logo-area">
            <div className="logo-icon">☢</div>
            <div className="logo-text">ORMOD<span>:</span>Directive <span style={{color:"var(--muted)",fontWeight:400,fontSize:"13px"}}>RCON</span></div>
          </div>
          <div className="header-divider"/>
          <div className="row" style={{gap:"8px"}}>
            <span className="pill pill-green"><span className="dot dot-green pulse"></span>Online</span>
            <span className="pill pill-muted">My Survival World</span>
            <span className="pill pill-orange">Cooperative</span>
          </div>
          <div className="spacer"/>
          <div className="header-right">
            <span>{online}/16 players</span>
            <div className="header-divider"/>
            <Clock/>
          </div>
        </div>

        <div className="nav-tabs">
          {TABS.map(t => (
            <div key={t.id} className={`nav-tab ${page === t.id ? "active" : ""}`} onClick={() => setPage(t.id)}>
              <span>{t.icon}</span>
              {t.label}
            </div>
          ))}
        </div>

        {page === "dashboard" && <Dashboard />}
        {page === "players" && <Players />}
        {page === "settings" && <Settings />}
        {page === "console" && <Console />}
        {page === "access" && <AccessControl />}
        {page === "wipe" && <WipeManager />}
      </div>
    </>
  );
}
