# TODO

## Outstanding Features

- Live player online status (requires RCON response parsing or stdin output parsing — game doesn't currently expose this over exec stdin)

---

## RCON Protocol Spec (pending game-side implementation)

**Files:** `docs/rcon/README.md` + `docs/rcon/schema.ts`
**Status:** Spec written; game server does not yet implement it. `WebSocketRconAdapter` in `apps/api/src/services/rcon-adapter.ts` is the dashboard-side integration stub.

### What might exist

- Full WebSocket JSON protocol (auth, command/result, server-push events)
- Standard commands mapped 1:1 from in-game console commands (see README for full list)
- **New commands (RCON-only, not in game console):**
  - `wipe map` / `wipe playerdata` / `wipe full` / `wipe playerdata <steamId>`
  - `playerdata <steamId>` — full player record from PlayerData JSON
  - `playerparty <steamId>` — party membership
  - `playerinv <steamId>` — full inventory
- **Server-push events** — server emits these to all RCON connections:
  - `player.join`, `player.leave`, `player.death`, `player.chat`
  - `player.ban`, `player.kick`, `player.permission.change`
  - `server.save`, `server.restart`, `server.start`, `server.shutdown`, `server.setting.change`
  - `wipe.start`, `wipe.complete`
  - `world.loot.respawn`, `world.day.change`, `world.weather.change`
  - `arena.match.start`, `arena.match.end`, `arena.player.respawn`

### Dashboard-side work needed when game implements RCON

- Implement `WebSocketRconAdapter.connect()`, `sendCommand()`, `disconnect()` using `net.Socket` or the `ws` package
- Expand `RconAdapter` interface (DEFER-3) to expose `subscribeToEvents(handler)` for the event push stream
- Wire `playerdata` / `playerparty` / `playerinv` results into the Players page for rich offline data
- Wire `player.join` / `player.leave` events into Dashboard live player count (replaces polling)
- Wire `player.death` events into a kill-feed / combat log on the Dashboard or Players page
- Wire `player.chat` into a chat log panel
- Wire `wipe.start` / `wipe.complete` into WipeManager progress feedback
- Wire `server.restart` countdown into Dashboard status bar
- Add a `rconPort` + `rconPass` field to the Server add/edit form in ServerManagement page
  (schema already has these columns; UI currently hides them)

## Design Constraints for Future Systems

- Any new server control feature must go through `rcon-adapter.ts` → never write to Docker socket directly from routes
- When RCON TCP is available from the game, `WebSocketRconAdapter` stub in `rcon-adapter.ts` is the integration point
- `SERVER_SETTING_GROUPS` in `lib/constants.ts` (used by Settings.tsx) will need to be replaced with live data from `serversettings.json` — the schema/field definitions should eventually move to a dedicated config or be inferred from the file itself
- `GAME_COMMANDS` in `lib/constants.ts` (used by Console.tsx) should eventually be driven by game version / capabilities API rather than hardcoded

## Deferred Architecture Work

### DEFER-1: Cron Scheduler → Dedicated Service

**Why deferred:** `cronJobs` Map and register/unregister/run functions are module-level state in `controllers/schedule.ts`. Touching it risks breaking cron restore on startup.
**What to do:**

- Create `apps/api/src/services/scheduler.ts` with a `CronSchedulerService` class
- Move: `cronJobs: Map<string, ScheduledTask>`, `registerCronJob()`, `unregisterCronJob()`, `runTask()`, `computeNextRun()` into the class
- Decorate instance onto Fastify via `plugins/scheduler.ts`
- Update `controllers/schedule.ts` to call `fastify.scheduler.*` methods
- Update `server.ts` to call `fastify.scheduler.restoreFromDb()` after listen
- Remove the `export { registerCronJob }` re-export from `routes/schedule.ts`
- Fix stale closure: `runTask()` should re-fetch task by ID from DB before executing
  **Files:** controllers/schedule.ts, routes/schedule.ts, server.ts, create services/scheduler.ts, create plugins/scheduler.ts

### DEFER-2: Inline Styles → CSS Classes (Design System Compliance)

**Why deferred:** ~150+ inline style props across all pages; risk of visual regression.
**What to do:**

- Audit every `style={{}}` occurrence across all pages with grep
- For each unique style combination, create a named CSS class in `apps/web/src/index.css`
- Replace inline props with className references
- Pattern: `.meta-text { font-size: 11px; color: var(--dim); font-family: var(--mono); }` for the common dim/mono text pattern (appears 15+ times)
- Test at 1400px, 900px, 600px breakpoints
  **Files:** All pages/\*.tsx + index.css

### DEFER-3: RCON Adapter Boundary Expansion

**Why deferred:** docker-manager is directly imported in controllers/servers.ts and routes/console.ts. Completing the abstraction requires expanding the RconAdapter interface.
**What to do:**

- Expand `RconAdapter` interface to include: `isRunning()`, `start()`, `stop()`, `restart()`, `getLogBuffer()`, `getLogEmitter()`
- `DockerExecAdapter` delegates all methods to `dockerManager`
- `WebSocketRconAdapter` implements TCP lifecycle
- Update `controllers/servers.ts` to use `getAdapter(server).*` instead of importing dockerManager
- Update `routes/console.ts` WS handler to use adapter log stream
  **Files:** services/rcon-adapter.ts, controllers/servers.ts, routes/console.ts, controllers/console.ts

### DEFER-4: Shared Type Package

**Why deferred:** Requires monorepo restructuring; medium risk of breaking imports.
**What to do:**

- Create `packages/shared/` pnpm workspace package
- Move API response types (Server, AccessList, ListEntry, ScheduledTask, WipeLog, User) to shared package
- Import in both `apps/api` and `apps/web` — eliminates frontend type drift
- Update `pnpm-workspace.yaml` to include `packages/*`
  **Files:** Create packages/shared/package.json, packages/shared/src/types.ts, update all consumer imports

### DEFER-5: AuthContext Auth Check Optimization

**Why deferred:** May be intentional (re-check session on navigation as security measure).
**What to do:** Move auth check to fire once on mount only (not on every `location.pathname` change). Add auth state invalidation mechanism (e.g. subscribe to BetterAuth session expiry event).
**File:** apps/web/src/context/AuthContext.tsx

### DEFER-6: React 19 Suspense + use() Migration

**Why deferred:** Requires adding Suspense boundaries throughout the component tree; architectural decision.
**What to do:**

- Add Suspense boundaries in App.tsx per route (replaces loading states)
- Migrate data-fetching hooks (useSettings, useLiveLog, ServerContext) to use `use()` hook with thrown Promises
- Eliminates the `useEffect` + `useState(null)` + `setLoading` triple-state pattern throughout the app
  **Files:** App.tsx, all hooks, all pages that currently manage their own loading state

### DEFER-7: Accessibility — Keyboard Navigation

**Why deferred:** Large cross-cutting change; requires accessible HTML semantics audit.
**What to do:**

- `ServerSwitcher.tsx:37` — div onClick → button
- `Players.tsx:75` — tr onClick → add `tabIndex={0}` + `onKeyDown` + `role="row"`
- `AccessControl.tsx:255` — sidebar-item divs → buttons or role="button" + tabIndex
- All interactive divs: add role="button" + tabIndex={0} + onKeyDown calling same handler
  **Files:** Multiple pages and components

### DEFER-8: Test Coverage Expansion (Beyond Immediate Fixes)

**What's missing:**

- POST /api/lists/:id/sync/:serverId (RBAC + sync behavior)
- POST /api/lists/sync-all (RBAC + behavior)
- POST /api/servers/:id/schedules/:taskId/run (RBAC + execution)
- GET /api/servers/:id/list-assignments + PUT (both untested)
- WipeService unit tests: assertSafePath, createBackup, stop-before-wipe flow
- FileIOService: writeList, deleteFileOrDir, path traversal rejection
- WebSocket console route (currently zero tests on WS upgrade path)
- CronScheduler: registerCronJob adds to Map, deleteSchedule calls unregisterCronJob, runTask execution per type
  **Pattern to follow:** See apps/api/tests/helpers/setup.ts for context factory; mockDockerManager() for Docker; os.tmpdir() for real filesystem tests.

---

## AUDIT FINDINGS (2026-02-28) — Remaining Items

Full findings in `docs/audit/findings/`. 29 specialist agents audited 46+ source files.
100 of 111 items fixed in session 2026-03-15. 11 items remain below.

---

### CRITICAL

**AUDIT-3 [CRITICAL] No CI pipeline**
Zero `.github/workflows/` files. Lint, typecheck, tests, and builds are entirely advisory. Broken TypeScript, failing tests, and security vulnerabilities can be merged without any automated gate.
Affected: `.github/` (missing), root `package.json`
Fix: Create `.github/workflows/ci.yml` running `tsc --noEmit`, `eslint .`, `cd apps/api && pnpm test`, and `cd apps/web && pnpm build` on every push and PR.

**AUDIT-12 [CRITICAL] `.env` file committed to git repository**
`.env` exists at repository root and is tracked by git despite being in `.gitignore` (was added before the ignore rule). Contains non-default configuration values — establishes precedent for credential exposure.
Affected: `.env` (root)
Fix: `git rm --cached .env` and commit the removal immediately. **Must be done manually.**

**AUDIT-16 [CRITICAL] No right-to-erasure mechanism for Steam IDs (GDPR Article 17)**
Player Steam IDs (personal data under GDPR) exist across `PlayerRecord` table, `ListEntry` table, `PlayerData/*.json` files, `banlist.txt`/`whitelist.txt`/`adminlist.txt`, and Pino log output. No API endpoint, admin page, or utility script covers erasure across all stores.
Affected: Multiple — `apps/api/prisma/schema.prisma` (PlayerRecord, ListEntry, ActionLog), game-side files (banlist.txt/whitelist.txt/adminlist.txt, PlayerData/*.json)
Fix: Build a `DELETE /api/players/:steamId/erase` endpoint that removes the Steam ID from all DB tables and dispatches `unban`/`removewhitelist`/`removepermissions` commands to purge game files.

### HIGH

**AUDIT-25 [HIGH] Google Fonts CDN leaks user IP to Google on every page load — GDPR violation**
`index.html` and `index.css` load fonts from `fonts.googleapis.com` and `fonts.gstatic.com`. Sends IP, user-agent, and referrer to Google without consent.
Affected: `apps/web/index.html:7-11`, `apps/web/src/index.css:1`
Fix: Download IBM Plex Mono and Sora font files, place in `apps/web/public/fonts/`, update `index.css` to use `@font-face` with local paths. Remove CDN `<link>` tags from `index.html`.

**AUDIT-45 [HIGH] No pre-commit hooks**
No lint, format, or typecheck enforcement at commit time. Broken code committed routinely.
Affected: `.husky/` (missing) or equivalent
Fix: Add `husky` + `lint-staged` (or `lefthook`) running ESLint + Prettier + `tsc --noEmit` on staged files.

### MEDIUM

**ACTION-1 [MEDIUM] No ban/kick/action records on player profile**
When a player is banned, kicked, or has permissions changed, an ActionLog entry is written but
the PlayerRecord model has no direct relation to it. Player profile pages cannot show a
punishment history for a given player without a separate query.
Affected: `apps/api/prisma/schema.prisma` (PlayerRecord, ActionLog)
Fix: Add an index or relation from ActionLog.targetSteamId to PlayerRecord, or add a dedicated
`punishments` query endpoint at `GET /api/players/:steamId/actions`.

**AUDIT-74 [MEDIUM] PII in Pino log output**
Steam IDs, player names, and IP addresses logged at `info` level without redaction. Pino's `redact` option not configured.
Affected: `apps/api/src/app.ts` (logger config)
Fix: Add `redact: ['req.headers.authorization', '*.steamId', '*.playerName', '*.ip']` to Pino logger options.

**AUDIT-85 [MEDIUM] No GDPR audit trail for ban/unban decisions**
Ban/unban events have no timestamp, no actor, no reason stored in a queryable form beyond the flat file.
Affected: `apps/api/prisma/schema.prisma`, `ListEntry` model
Fix: Add `bannedBy`, `bannedAt`, `unbannedBy`, `unbannedAt` fields to `ListEntry` or a separate `BanEvent` table.

### LOW

**AUDIT-100 [LOW] SteamCMD downloaded without checksum verification**
`Dockerfile.gameserver` downloads SteamCMD from Valve's CDN with no SHA256 check. Supply chain substitution would go undetected.
Affected: `docker/Dockerfile.gameserver`
Fix: Pin the expected SHA256 and verify with `sha256sum -c` after download.

**AUDIT-105 [LOW] No SECURITY.md**
No vulnerability disclosure policy. Security researchers have no contact path.
Affected: Repository root
Fix: Create `SECURITY.md` with a responsible disclosure email and response SLA.

