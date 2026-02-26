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
- **Frontend:** React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **API:** Node.js + Fastify 5 + TypeScript
- **Database:** SQLite via Prisma 7 ORM (`file:/data/ormod-rcon.db` in Docker, `file:./ormod-rcon.db` in dev)
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
- `$HOME/.config/ORMOD/Playtest/<ServerName>/` (set `HOME=/home/steam`)

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
RegionData/
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
│   │   │   ├── app.ts          # Builds & returns Fastify instance (testable)
│   │   │   ├── server.ts       # Thin entry point (listen + post-startup tasks)
│   │   │   ├── config.ts       # Env JSON schema + Fastify type augmentation
│   │   │   ├── plugins/        # Autoloaded (fp dependency graph controls order)
│   │   │   │   ├── sensible.ts       # @fastify/sensible (httpErrors, reply helpers)
│   │   │   │   ├── env.ts            # @fastify/env (schema validation + dotenv)
│   │   │   │   ├── database.ts       # Prisma lifecycle (decorate + onClose)
│   │   │   │   ├── formbody.ts       # @fastify/formbody
│   │   │   │   ├── cookie.ts         # @fastify/cookie
│   │   │   │   ├── helmet.ts         # @fastify/helmet (HSTS, referrer, frameguard)
│   │   │   │   ├── cors.ts           # @fastify/cors (reads fastify.config)
│   │   │   │   ├── csrf.ts           # @fastify/csrf-protection (cookie double-submit)
│   │   │   │   ├── underpressure.ts  # @fastify/under-pressure (backpressure)
│   │   │   │   └── auth.ts           # BetterAuth hooks + auth guard
│   │   │   ├── routes/         # Autoloaded under /api prefix (fastify.route + schemas)
│   │   │   │   ├── servers.ts, players.ts, settings.ts, access-lists.ts
│   │   │   │   ├── console.ts  # default=HTTP routes; named consoleWsRoutes (manual)
│   │   │   │   ├── wipe.ts, schedule.ts
│   │   │   │   ├── setup.ts         # GET+POST /api/setup (first-run)
│   │   │   │   └── capabilities.ts  # GET /api/capabilities
│   │   │   ├── controllers/    # Handler logic (one file per route domain)
│   │   │   ├── services/       # docker-manager, file-io, rcon-adapter, wipe-service, list-service
│   │   │   ├── lib/            # auth.ts (BetterAuth config)
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
- pnpm native build scripts (Prisma, better-sqlite3, esbuild): `pnpm approve-builds` is interactive (TUI) — add to `pnpm.onlyBuiltDependencies` in root `package.json` instead.
- `tsc` (via `pnpm build` in `apps/web`) emits `.js`/`.d.ts`/`.js.map` alongside source files — these are gitignored via `apps/web/src/**/*.js` etc. Do not commit them.
- `apps/web/tsconfig.json` must override `"types": []` — the base tsconfig inherits `"types": ["node"]` but `@types/node` is API-only; without this override `tsc --noEmit` fails in the web package.
- Vitest full-suite parallel runs can show transient fork failures (SQLite isolation); always re-run the failing file in isolation to confirm before investigating.
- Expandable table rows: use `<Fragment key={id}>` for the outer wrapper, add `key={\`detail-${id}\`}` to the conditional `<tr>`
- `preview_console_logs` accumulates across page reloads — use `performance.getEntriesByType('resource')` to confirm which Vite file version is active
- cron-parser v4/v5 API: use `CronExpressionParser.parse(expr).next().toDate()` (not `parseExpression`)
- Prisma array-form `$transaction` does not support `skipDuplicates: true` at TypeScript level — remove it and use `deleteMany` before `createMany` instead
- `@fastify/static` is registered in `app.ts` when `STATIC_PATH` env var is set (Docker production). Uses `prefix: '/'` and a catch-all 404 handler to serve `index.html` for SPA routing.
- Prisma 7 uses driver adapters — `@prisma/adapter-better-sqlite3` is required. Client is generated to `src/generated/prisma/` (not `node_modules`). Config lives in `prisma.config.ts`. The `prisma db push --skip-generate` flag was removed in v7.
- Fastify 5 requires async hooks — no callback-style `done` parameter. The `csrfProtection` callback is wrapped in a Promise in `plugins/csrf.ts`.
- React Router v7 uses `react-router` package (not `react-router-dom`). The v6 future flags (`v7_startTransition`, `v7_relativeSplatPath`) are now defaults and were removed from `App.tsx`.

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
- ✅ Proper Fastify plugin architecture (`app.ts`/`server.ts` split, `@fastify/autoload`, numbered plugins)
- ✅ Env validation via `@fastify/env` with typed `fastify.config.*`
- ✅ Security plugins: `@fastify/helmet`, `@fastify/csrf-protection`, `@fastify/under-pressure`
- ✅ `@fastify/static` registered in `app.ts` for Docker static serving
- ✅ Bind-mount support for game binary and saves (`GAME_BINARY_PATH`, `SAVES_PATH`)
- ✅ `DASHBOARD_HOST` for per-interface port binding
- ✅ Auth (BetterAuth) — session-based, login/setup pages, HTTP-only cookies
- ✅ RBAC enforcement — OWNER/ADMIN/VIEWER roles checked per-route via `requireWrite`/`requireOwner` preHandlers
- ✅ WebSocket auth — explicit session validation on WS upgrade (not relying on preHandler hooks)
- ✅ CSRF protection — double-submit cookie pattern with auto-fetch/retry on frontend
- ✅ Backend test suite — 84 Vitest tests covering auth guards, RBAC, CSRF, and all route groups
- ⏳ **TODO:** Live player online status (requires RCON or stdin-response parsing)

---

## Testing

Backend tests use **Vitest** with isolated SQLite databases per test file.

```bash
cd apps/api
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
npx vitest run --reporter=verbose  # Verbose output
```

**Architecture:**
- `pool: 'forks'` — each test file gets its own Node.js process for PrismaClient isolation
- `execArgv: ['--import', 'tsx/esm']` — enables TypeScript + `.js→.ts` resolution in forked processes
- `tests/helpers/setup.ts` — creates isolated SQLite DB, builds Fastify app, creates 3 users (OWNER/ADMIN/VIEWER) with session cookies and CSRF tokens
- Docker-dependent routes (start/stop/restart, console commands) are tested for RBAC enforcement only (not Docker integration) since `vi.mock()` can't reach the singleton loaded by `@fastify/autoload` through tsx

**Coverage:** 12 test files, 84 tests — health, auth-guards, csrf, setup, capabilities, servers, access-lists, wipe, schedule, settings, console, players

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
# Edit .env: set BETTER_AUTH_SECRET, SERVER_NAME, GAME_BINARY_PATH=../server, SAVES_PATH=../configs

docker compose up -d
```

## Getting Started (Local Dev)
```bash
pnpm install
cp .env.example .env
# Edit .env: set DATABASE_URL=file:./ormod-rcon.db
cd apps/api && npx prisma migrate dev && cd ../..
pnpm dev   # API on :3001, web on :3000
```
The API dev script uses `--env-file=../../.env` to load the root `.env` file.
`@fastify/env` also reads it via `dotenv.path: '../../.env'`.

---

## Workflow Rules

### Planning
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### Subagents
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### Self-Improvement
- After ANY correction from the user: update `docs/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### Task Management
1. **Plan First**: Write plan to `docs/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `docs/todo.md`
6. **Capture Lessons**: Update `docs/lessons.md` after corrections

### Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
