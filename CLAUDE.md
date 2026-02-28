# ormod-rcon — ORMOD: Directive Community RCON Dashboard

## What this project is

A self-hosted, open-source server management dashboard for ORMOD: Directive dedicated servers.
Think RustAdmin / RCON Web Admin / Hell Let loose Community RCON but purpose-built for ORMOD.

## ⚠ Read these first

Before writing any code, read these two files in this order:

1. `docs/architecture.md` — full tech stack, Prisma schema, services, Docker setup, API routes
2. `docs/design-system.md` — every design decision: colors, fonts, components, do/don't rules

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

## Deployment Architecture

The dashboard can run locally with `pnpm dev` for frontend/API development, but Docker control features (start/stop/restart/logs/exec) are unavailable without a Docker socket. "No local mode" specifically means no node-pty process spawning — the game server cannot be controlled from local dev, but the rest of the dashboard works fine. Production deployment uses Docker exclusively.

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

## Hardened Deployment (docker-compose.secure.yml)

`docker-compose.secure.yml` is the recommended variant for internet-accessible (community/production) servers. Three key differences from the base compose:

1. **Socket proxy** — tecnativa/docker-socket-proxy sits between `/var/run/docker.sock` and the dashboard. Only container-control and exec API paths are exposed; images, networks, volumes, build, events, swarm, secrets, and all other Docker API endpoints are blocked at the proxy level.
2. **Non-root dashboard** — the dashboard process runs as UID 1001. The entrypoint script briefly chowns the three volume-mount paths as root, then drops privileges before starting Prisma and Fastify.
3. **Internal proxy network** — `ormod-proxy-internal` is marked `internal: true`. The socket-proxy is reachable only from the dashboard container, with no outbound internet access.

Usage:

```bash
docker compose -f docker-compose.secure.yml up -d
```

**Use `docker-compose.override.yml` for any local or per-server customisation** — it auto-merges with whichever base compose you use (`docker-compose.yml` or `docker-compose.secure.yml`) and should be gitignored so it never pollutes upstream. Never commit host-specific config or secrets to the base compose files.

Example override for TLS:

```yaml
# docker-compose.override.yml  (gitignored — never commit)
services:
  ormod-dashboard:
    environment:
      TLS_CERT_PATH: /certs/origin.pem
      TLS_KEY_PATH: /certs/origin-key.pem
    volumes:
      - ./certs:/certs:ro
```

Other common override uses: changing `API_PORT`, binding to a specific `API_HOST` interface, mounting a local binary for testing, overriding `GAME_CONTAINER_NAME` when running multiple stacks on one host.

---

## TLS Support

Mount certs into `/certs/` via `docker-compose.override.yml` (see above). Set `TLS_CERT_PATH=/certs/origin.pem` and `TLS_KEY_PATH=/certs/origin-key.pem`. When both paths are set and the files exist, Fastify starts as HTTPS. See `certs/README.md` for step-by-step instructions.

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
│   │   ├── prisma.config.ts    # Prisma 7 driver adapter config (alongside package.json)
│   │   ├── src/
│   │   │   ├── app.ts          # Builds & returns Fastify instance (testable)
│   │   │   ├── server.ts       # Thin entry point (listen + post-startup tasks)
│   │   │   ├── config.ts       # Env JSON schema + Fastify type augmentation
│   │   │   ├── types.ts        # Shared TypeScript types
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
│   │   │   │   ├── capabilities.ts  # GET /api/capabilities
│   │   │   │   ├── users.ts         # User CRUD (create/delete/role assignment)
│   │   │   │   └── csrf.ts          # GET /api/csrf (CSRF token endpoint)
│   │   │   ├── controllers/    # Handler logic (one file per route domain)
│   │   │   │   └── users.ts
│   │   │   ├── services/       # docker-manager, file-io, rcon-adapter, wipe-service, list-service
│   │   │   ├── lib/            # auth.ts (BetterAuth config)
│   │   │   └── db/
│   │   └── prisma/
│   │       └── schema.prisma   # Full schema in architecture doc
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── layout/     # AppShell, ServerSwitcher, NavTabs
│       │   │   └── ui/         # Shared Tailwind components (includes ChangePasswordModal.tsx)
│       │   ├── context/        # ServerContext.tsx, AuthContext.tsx
│       │   ├── pages/          # Dashboard, Players, Settings, Console, AccessControl, WipeManager, Schedules, ServerManagement, Login, Setup, UserManagement
│       │   ├── hooks/          # useServer, useLiveLog, useSettings
│       │   ├── api/            # client.ts (typed fetch wrapper)
│       │   └── lib/            # auth-client.ts (BetterAuth client), constants.ts (SERVER_SETTING_GROUPS, GAME_COMMANDS)
│       └── vite.config.ts
├── docs/
│   ├── architecture.md              # ← READ THIS
│   ├── design-system.md             # ← READ THIS
│   └── ormod-rcon.jsx               # ← UI prototype / visual reference
├── docker/
│   ├── Dockerfile.dashboard    # Combined API + React static (single container)
│   ├── Dockerfile.gameserver   # Game binary container
│   ├── entrypoint-gameserver.sh
│   └── game-binary/            # Optional: place binary here if not using GAME_BINARY_PATH
├── certs/                      # TLS certificates (README.md inside)
├── docker-compose.yml
├── docker-compose.secure.yml   # Hardened deployment variant (socket proxy + non-root)
└── .env.example
```

---

## CSS Architecture

- Tailwind v4 is activated via `@import "tailwindcss"` at the top of `apps/web/src/index.css`
- **Prefer named CSS classes in `index.css`** over inline Tailwind utilities — this centralises the design system, keeps components readable, and makes global visual changes easy. Responsive layout breakpoints (`md:`, `sm:`) are the one legitimate exception for grid/layout changes only.
- All component styles live as named CSS classes in `index.css` (e.g. `.card`, `.btn`, `.perm`)
- Tailwind provides: Preflight reset + responsive utilities via CSS variables only

---

## UI Design Summary (read design-system.md for full detail)

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
- `tsc` (via `pnpm build` in `apps/web`) emits `.js`/`.d.ts`/`.js.map` alongside source files — these are gitignored via `apps/web/src/**/*.js` etc. Prefer not committing them.
- `apps/web/tsconfig.json` must override `"types": []` — the base tsconfig inherits `"types": ["node"]` but `@types/node` is API-only; without this override `tsc --noEmit` fails in the web package.
- Vitest full-suite parallel runs can show transient fork failures (SQLite isolation); always re-run the failing file in isolation to confirm before investigating.
- Expandable table rows: use `<Fragment key={id}>` for the outer wrapper, add `key={\`detail-${id}\`}`to the conditional`<tr>`
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
9. **Login** — email/password form, BetterAuth session-based auth, redirects to Setup on first run
10. **Setup** — first-run owner account creation, 8-character minimum password validation, auto-sign-in after setup
11. **User Management** — dashboard user CRUD, role assignment (OWNER/ADMIN/VIEWER), self-deletion protection

---

## RCON Abstraction (Important)

The game currently only supports commands via Docker exec to stdin. RCON WebSocket is coming.
**The `rcon-adapter.ts` service abstracts both.** The rcon-adapter is the correct boundary for all server command dispatch. Write to the Docker socket directly only if you're working inside `docker-manager.ts` itself — all other layers go through the adapter.

Current flow: route → `getAdapter()` → `DockerExecAdapter` → Docker API → game stdin
Future flow: route → `getAdapter()` → `WebSocketRconAdapter` → RCON TCP

---

## Current Implementation Status

- ✅ All 11 pages built and wired to real API
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
- ✅ `API_HOST`/`API_PORT` for per-interface binding (both compose files use the same env var names)
- ✅ Auth (BetterAuth) — session-based, login/setup pages, HTTP-only cookies
- ✅ RBAC enforcement — OWNER/ADMIN/VIEWER roles checked per-route via `requireWrite`/`requireOwner` preHandlers
- ✅ WebSocket auth — explicit session validation on WS upgrade (not relying on preHandler hooks)
- ✅ CSRF protection — double-submit cookie pattern with auto-fetch/retry on frontend
- ✅ Backend test suite — 84 Vitest tests covering auth guards, RBAC, CSRF, and all route groups
- ✅ Login + Setup pages (full auth flow, first-run wizard)
- ✅ User Management page (OWNER/ADMIN/VIEWER CRUD, self-protection)
- ✅ `users.ts` API route (user create/delete/role)
- ✅ `csrf.ts` API route (CSRF token endpoint)
- ✅ TLS/HTTPS support (`docker-compose.secure.yml`, `certs/` bind-mount)
- ✅ Socket proxy hardening option (`docker-compose.secure.yml` — non-root process, filtered Docker API via tecnativa/docker-socket-proxy)

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
# Edit .env — key vars to set:
#   BETTER_AUTH_SECRET    — generate with: openssl rand -hex 32
#   SERVER_NAME           — your server name
#   GAME_BINARY_PATH      — host path to game binary dir (e.g. ../server)
#   SAVES_PATH            — host path to save/config dir (e.g. ../configs)
#   API_HOST, API_PORT    — bind address and port for the dashboard
#   PUBLIC_URL            — full URL clients use (e.g. http://192.168.1.100:3000)
#   GAME_CONTAINER_NAME   — Docker container name for the game (default: ormod-game)
#   KCP_PORT              — KCP/Mirror networking port (default: 7777)
# See .env.example for the full reference.

docker compose up -d
```

## Getting Started (Local Dev)

```bash
pnpm install
cp .env.example .env
# Edit .env: set DATABASE_URL=file:./prisma/ormod-rcon.db
cd apps/api && pnpm db:migrate && cd ../..
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

### Clarification

- Before diving into any task where the intent is ambiguous, approach has multiple valid paths, or scope is unclear: ask clarifying questions first. Do not assume — a brief question upfront saves significant rework.

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
