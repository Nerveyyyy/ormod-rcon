# ormod-rcon — ORMOD: Directive Community RCON Dashboard

## What this project is
A self-hosted, open-source server management dashboard for ORMOD: Directive dedicated servers.
Think RustAdmin / RCON Web Admin but purpose-built for ORMOD.

## ⚠ Read these first
Before writing any code, read these two files in this order:

1. `docs/ORMOD_RCON_ARCHITECTURE.md` — full tech stack, Prisma schema, services, Docker setup, API routes
2. `docs/UI_DESIGN_SYSTEM.md` — every design decision: colors, fonts, components, do/don't rules

The working UI prototype is at `docs/ormod-rcon.jsx` — it is the visual reference.
When building any React component, open this file and match it exactly.

---

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v4
- **API:** Node.js + Fastify + TypeScript
- **Database:** SQLite via Prisma ORM (`file:/data/ormod-rcon.db` in Docker, `file:./ormod-rcon.db` in dev)
- **Realtime:** WebSocket (`ws` library + `@fastify/websocket`)
- **Auth:** Better Auth (session-based, self-hosted)
- **Process mgmt:** Docker socket via native Node.js `http` module (no external package)
- **Scheduling:** `node-cron`
- **Monorepo:** pnpm workspaces (`apps/api`, `apps/web`)
- **Docker:** 2-container setup — see architecture doc

---

## Deployment Architecture (Docker-only)

This project runs exclusively on Docker. There is **no LOCAL mode** (no node-pty process spawning).

```
ormod-game container    ←── shared volume (SAVES_PATH) ──→    ormod-dashboard container
  game binary                /saves (read-write)                  Fastify API + React UI
  writes save files                                              reads/writes save files
  reads admin/ban/whitelist                                      controls game via Docker socket
                                  /var/run/docker.sock
```

**Process management** uses the Docker API over the Unix socket:
- Start/stop/restart: `POST /containers/{name}/start|stop|restart`
- Stream logs: `GET /containers/{name}/logs?follow=true&stdout=true`
- Send stdin commands: `POST /containers/{name}/exec` + exec start
- All via Node.js built-in `http` module with `socketPath: '/var/run/docker.sock'`

**No node-pty. No dockerode. No additional packages.**

---

## Key Game Context
- ORMOD: Directive is a **Rust-style open-world survival sandbox** (NOT military/tactical)
- Post-apocalyptic world overrun by mechanoids called "ORMOD"
- Game modes: Cooperative (PvE), PVP, Creative, Arena
- Survival mechanics: hunger, thirst, temperature, health, wellness

**Server paths (inside game container):**
- `$HOME/.config/ORMOD/Saves/<ServerName>/` (set `HOME=/home/steam`)

**Server startup:**
```bash
ORMODDirective -batchmode -nographics -servername "MyServer"
```
Port and query port are configured in **`serversettings.json`**, not as command-line flags.
Docker exposes them via the `GAME_PORT`/`QUERY_PORT` variables in `.env` (used only for the Docker `ports:` mapping).

**Permission hierarchy:** `[server]` > `[admin]` > `[operator]` > `[client]`

**serversettings.json hot-reloads** — writing to it takes effect immediately, no restart needed.

---

## Save Directory Contents
```
ChunkData/          RegionData/         PlayerData/
adminlist.txt       banlist.txt         whitelist.txt
buildareas.json     entitydata.json     loottables.json
mapdata.json        networkentities.json partialchunkdata.dat
pathfindingdata.dat serversettings.json  spawnregion.dat
structuredata.dat   weatherdata.dat      worldregrowth.json
log.txt
```

**adminlist.txt format:** `SteamId:PermissionLevel` (e.g. `76561198001234567:admin`)
**banlist.txt / whitelist.txt:** plain list of SteamIds, one per line

---

## Project Structure
```
ormod-rcon/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── plugins/        # auth, websocket, cors
│   │   │   ├── routes/         # servers, players, settings, access-lists, console, wipe, schedule
│   │   │   ├── services/       # docker-manager, file-io, rcon-adapter, wipe-service, list-service
│   │   │   └── db/
│   │   └── prisma/
│   │       └── schema.prisma   # Full schema in architecture doc
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── layout/     # AppShell, ServerSwitcher, NavTabs
│       │   │   └── ui/         # Shared Tailwind components
│       │   ├── context/        # ServerContext.tsx
│       │   ├── pages/          # Dashboard, Players, Settings, Console, AccessControl, WipeManager, Schedules, ServerManagement
│       │   ├── hooks/          # useServer, useLiveLog, useSettings
│       │   └── api/            # client.ts (typed fetch wrapper)
│       └── vite.config.ts
├── docs/
│   ├── ORMOD_RCON_ARCHITECTURE.md   # ← READ THIS
│   ├── UI_DESIGN_SYSTEM.md          # ← READ THIS
│   └── ormod-rcon.jsx               # ← UI prototype / visual reference
├── docker/
│   ├── Dockerfile.dashboard    # Combined API + React static (single container)
│   ├── Dockerfile.gameserver   # Game binary container
│   ├── entrypoint-gameserver.sh
│   └── game-binary/            # Optional: place binary here if not using GAME_BINARY_PATH
├── docker-compose.yml
└── .env.example
```

---

## CSS Architecture
- Tailwind v4 is activated via `@import "tailwindcss"` at the top of `apps/web/src/index.css`
- **Do not** use Tailwind utility classes inline in JSX (e.g. no `className="text-[#c8d4c0]"`)
- All component styles live as named CSS classes in `index.css` (e.g. `.card`, `.btn`, `.perm`)
- Tailwind provides: Preflight reset + responsive utilities via CSS variables only

---

## UI Design Summary (read UI_DESIGN_SYSTEM.md for full detail)

**Fonts:** IBM Plex Mono (all data/values) + Sora (all UI labels)
**Colors:** Dark earthy green-gray backgrounds, orange primary accent, muted greens/reds/blues
**Feel:** Post-apocalyptic survival terminal — sharp corners (2–3px max), no rounded cards
**Active nav:** Orange underline + orange text
**Permission badges:** Monospace, lowercase, bracketed: `[server]` `[admin]` `[operator]` `[client]`
**Destructive actions:** Always require type-to-confirm dialog

---

## Access List Scope System (decided)
Three scopes implemented in `AccessList` Prisma model and AccessControl UI:
- `GLOBAL` — synced to ALL managed servers
- `SERVER` — synced only to linked servers
- `EXTERNAL` — read-only feed from a URL, merged into server ban files on sync

---

## Known Gotchas
- React Router v6 future flags are set in `App.tsx` (`v7_startTransition`, `v7_relativeSplatPath`) — do not remove
- Expandable table rows: use `<Fragment key={id}>` for the outer wrapper, add `key={\`detail-${id}\`}` to the conditional `<tr>`
- `preview_console_logs` accumulates across page reloads — use `performance.getEntriesByType('resource')` to confirm which Vite file version is active
- cron-parser v4/v5 API: use `CronExpressionParser.parse(expr).next().toDate()` (not `parseExpression`)
- Prisma array-form `$transaction` does not support `skipDuplicates: true` at TypeScript level — remove it and use `deleteMany` before `createMany` instead
- `@fastify/static` must be registered in `server.ts` when `STATIC_PATH` env var is set (Docker production). Use `prefix: '/'` and a catch-all 404 handler to serve `index.html` for SPA routing.

---

## Pages (all built)
1. **Dashboard** — server stats, live log stream, online players, quick actions
2. **Players** — table with expand rows, per-player actions (teleport, heal, kick, ban, etc.)
3. **Server Settings** — live editor for serversettings.json with JSON preview pane
4. **Console** — terminal with command history, quick command palette with permission levels
5. **Access Control** — ban list, whitelist, admin list (tabs), linked to shared AccessList DB records
6. **Wipe Manager** — quick wipe presets, custom file picker, confirmation dialog, history, scheduler
7. **Schedules** — cron-based tasks (wipe, command, announcement, restart) with next-run display
8. **Server Management** — add/remove servers, assign access lists, start/stop/restart processes

---

## RCON Abstraction (Important)
The game currently only supports commands via Docker exec to stdin. RCON WebSocket is coming.
**The `rcon-adapter.ts` service abstracts both.** Never write to the Docker socket directly from routes.
Always go through `getAdapter(server).sendCommand(cmd)`.

Current flow: route → `getAdapter()` → `DockerExecAdapter` → Docker API → game stdin
Future flow: route → `getAdapter()` → `WebSocketRconAdapter` → RCON TCP

---

## Current Implementation Status
- ✅ All 8 pages built and wired to real API (no mock data)
- ✅ All API routes implemented (Prisma + file I/O)
- ✅ WebSocket console (ring buffer + EventEmitter → live stream)
- ✅ Wipe service (fs.cp backup, file deletion, DB logging)
- ✅ Scheduled tasks (node-cron, restore on startup)
- ✅ Access lists with EXTERNAL URL refresh
- ✅ Server Management page (add/edit/delete servers, start/stop/restart)
- ✅ `docker-manager.ts` — Docker socket replaces node-pty entirely
- ✅ `@fastify/static` registered in `server.ts` for Docker static serving
- ✅ Bind-mount support for game binary and saves (`GAME_BINARY_PATH`, `SAVES_PATH`)
- ✅ `DASHBOARD_HOST` for per-interface port binding
- ⏳ **TODO:** Auth (Better Auth) — all routes currently open for local/Docker dev
- ⏳ **TODO:** Live player online status (requires RCON or stdin-response parsing)

---

## Getting Started (Docker)
```bash
# Recommended dedi box layout — clone into ormod/rcon/
mkdir -p /opt/ormod/{server,configs}
cp -r /path/to/ormod-server/* /opt/ormod/server/
chmod +x /opt/ormod/server/ORMODDirective
chown -R 1000:1000 /opt/ormod/configs

git clone https://github.com/Nerveyyyy/ormod-rcon /opt/ormod/rcon
cd /opt/ormod/rcon
cp .env.example .env
# Edit .env: set JWT_SECRET, SERVER_NAME, GAME_BINARY_PATH=../server, SAVES_PATH=../configs

docker compose up -d
```

## Getting Started (Local Dev)
```bash
pnpm install
cd apps/api && cp ../../.env.example .env
# Edit .env: set DATABASE_URL=file:./ormod-rcon.db
npx prisma migrate dev
cd ../..
pnpm dev   # API on :3001, web on :3000
```
