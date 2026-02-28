# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

#### Authentication and Authorization

- BetterAuth session-based authentication with HTTP-only cookies
- OWNER / ADMIN / VIEWER RBAC roles enforced per-route via `requireWrite` / `requireOwner` preHandlers
- WebSocket auth — explicit session validation on WS upgrade (not relying on preHandler hooks)
- CSRF protection — double-submit cookie pattern with auto-fetch/retry on the frontend
- Login page — email/password form, redirects to Setup on first run
- Setup page — first-run owner account creation wizard with 8-character minimum password validation and auto-sign-in after setup
- User Management page — dashboard user CRUD, role assignment, self-deletion protection
- `users.ts` API route — user create / delete / role assignment
- `csrf.ts` API route — CSRF token endpoint

#### UI Pages (all wired to real API)

- Dashboard — server stats, live log stream, online players, quick actions
- Players — expandable table rows, per-player actions (teleport, heal, kick, ban, promote/demote)
- Server Settings — live editor for `serversettings.json` with JSON preview pane
- Console — terminal with command history and quick command palette with permission levels
- Access Control — ban list, whitelist, and admin list tabs linked to shared AccessList database records
- Wipe Manager — quick wipe presets, custom file picker, type-to-confirm dialog, wipe history, wipe scheduler
- Schedules — cron-based task management (wipe, command, announcement, restart) with next-run display
- Server Management — add / edit / delete servers, assign access lists, start / stop / restart processes

#### API Routes

- `GET/POST /api/servers` — server CRUD
- `GET /api/players` — player list
- `GET/PUT /api/settings` — `serversettings.json` live editor
- `GET/POST/DELETE /api/access-lists` — access list management with GLOBAL / SERVER / EXTERNAL scope support
- `GET/POST /api/console` (HTTP) + WebSocket console route — command dispatch and log streaming
- `GET/POST/DELETE /api/wipe` — wipe execution, backup, history
- `GET/POST/DELETE /api/schedule` — cron task CRUD
- `GET /api/capabilities` — server feature flags
- `GET/POST /api/setup` — first-run setup flow

#### Backend Infrastructure

- Fastify 5 plugin architecture — `app.ts` / `server.ts` split, `@fastify/autoload` with numbered dependency graph
- `@fastify/env` environment validation with typed `fastify.config.*`
- Prisma 7 ORM with `@prisma/adapter-better-sqlite3` driver adapter, client generated to `src/generated/prisma/`
- Security plugins: `@fastify/helmet` (HSTS, referrer policy, frameguard), `@fastify/under-pressure` (backpressure)
- `@fastify/static` registered in `app.ts` for Docker static file serving with SPA catch-all

#### Real-time and Process Management

- WebSocket console with ring buffer and EventEmitter-based live log streaming
- `docker-manager.ts` — Docker socket process management via native Node.js `http` module (no dockerode / node-pty): start, stop, restart, log streaming, stdin exec
- RCON adapter abstraction (`rcon-adapter.ts`) — `DockerExecAdapter` today, `WebSocketRconAdapter` stub ready for when the game adds RCON TCP

#### Game Server Features

- Wipe service — `fs.cp` backup, selective file deletion, wipe history logging to database
- Scheduled tasks via `node-cron` — all active schedules restored on API startup
- Access lists with GLOBAL / SERVER / EXTERNAL scopes; EXTERNAL lists fetch from a URL and merge into server files on sync
- `serversettings.json` live editor — writes take effect immediately (game hot-reloads the file, no restart needed)
- Admin list management using `SteamId:PermissionLevel` format; ban list and whitelist as plain SteamId-per-line files

#### Docker and Deployment

- Two-container Docker Compose setup — `ormod-game` (game binary) and `ormod-dashboard` (Fastify API + React UI) sharing a save-files volume
- `docker-compose.secure.yml` — hardened production variant: tecnativa/docker-socket-proxy (filtered Docker API, only container-control and exec endpoints exposed), non-root dashboard process (UID 1001), internal-only proxy network
- TLS / HTTPS support — mount certificates via `docker-compose.override.yml`, Fastify starts as HTTPS when `TLS_CERT_PATH` and `TLS_KEY_PATH` are set
- `GAME_BINARY_PATH` and `SAVES_PATH` bind-mount support
- `API_HOST` / `API_PORT` for per-interface binding
- `docker-compose.override.yml` pattern documented for local / per-server customisation (gitignored, never committed)

#### Testing

- Backend test suite — 84 Vitest tests across 12 test files
- Isolated SQLite database per test file using `pool: 'forks'`
- Test helper (`tests/helpers/setup.ts`) — creates Fastify app with OWNER / ADMIN / VIEWER users, session cookies, and CSRF tokens
- Coverage: health, auth-guards, CSRF, setup, capabilities, servers, access-lists, wipe, schedule, settings, console, players
