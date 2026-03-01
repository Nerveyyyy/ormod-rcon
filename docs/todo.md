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

## AUDIT FINDINGS (2026-02-28)

Full findings in `docs/audit/findings/`. 29 specialist agents audited 46+ source files.

---

### CRITICAL

**AUDIT-1 [CRITICAL] No rate limiting on any endpoint**
No `@fastify/rate-limit` installed. Auth endpoint (`POST /api/auth/sign-in`) accepts unlimited brute-force attempts per IP; same for setup and password change.
Affected: `apps/api/src/app.ts` (global), `apps/api/src/plugins/` (no rate-limit plugin)
(security-engineer C-1, security-auditor H, penetration-tester HIGH, architect-reviewer info)
Fix: Add `@fastify/rate-limit` to dependencies and register globally in `app.ts`; apply 5 req/min limit to `/api/auth/*` routes specifically.

**AUDIT-2 [CRITICAL] Content Security Policy disabled**
`@fastify/helmet` registered but `contentSecurityPolicy: false`. Any XSS (e.g., unescaped player names in console stream) enables direct session token theft.
Affected: `apps/api/src/plugins/helmet.ts:9`
(security-engineer C-2, security-auditor H-3, compliance-auditor L-2)
Fix: Enable CSP with `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ws: wss:`. Test Tailwind v4 runtime CSS compatibility first.

**AUDIT-3 [CRITICAL] No CI pipeline**
Zero `.github/workflows/` files. Lint, typecheck, tests, and builds are entirely advisory. Broken TypeScript, failing tests, and security vulnerabilities can be merged without any automated gate.
Affected: `.github/` (missing), root `package.json`
(tooling-engineer C-1, deployment-engineer C-1, git-workflow-manager H-1, dx-optimizer C-1 compound)
Fix: Create `.github/workflows/ci.yml` running `tsc --noEmit`, `eslint .`, `cd apps/api && pnpm test`, and `cd apps/web && pnpm build` on every push and PR.

**AUDIT-4 [CRITICAL] `dockerRequest` never checks HTTP response status codes**
Resolves successfully on any HTTP status including 404, 409, and 500. Stop/start/restart/exec commands appear to succeed when they have silently failed.
Affected: `apps/api/src/services/docker-manager.ts:77-106`
(code-reviewer H-1 elevated, chaos-engineer C-1, sre-engineer note)
Fix: Check `response.statusCode >= 400` inside `dockerRequest` and throw an error with the status code and body.

**AUDIT-5 [CRITICAL] Floating promise in cron callback — unhandled rejection crashes process**
`runTask(task)` not awaited in `cron.schedule()` callback. Rejected promise is unhandled; Node.js 20 terminates the process by default on unhandled rejection. Four agents independently identified this.
Affected: `apps/api/src/controllers/schedule.ts:78`
(code-reviewer C-1, chaos-engineer H-3, architect-reviewer H-3, javascript-pro H-02)
Fix: `cron.schedule(expr, async () => { try { await runTask(task) } catch (e) { app.log.error(e) } })`.

**AUDIT-6 [CRITICAL] Floating promise in `startLogStream` — inspect().then() without .catch()**
`this.inspect(containerName).then(...)` fires without `.catch()`. Docker socket errors during reconnect cause unhandled rejection and process termination.
Affected: `apps/api/src/services/docker-manager.ts:327`
(code-reviewer C-2, javascript-pro C-01, chaos-engineer L-2)
Fix: Attach `.catch((err) => { emitter.emit('exit') })` to the floating promise.

**AUDIT-7 [CRITICAL] Deleting AccessList fails when ServerListLinks exist**
`ServerListLink.list` FK has no `onDelete: Cascade`. Delete throws FK constraint error (or silently corrupts depending on SQLite FK pragma state). The only relation in the schema missing cascade.
Affected: `apps/api/prisma/schema.prisma:155`, `apps/api/src/controllers/access-lists.ts:56`
(code-reviewer C-3, database-administrator L-5, sql-pro implicit)
Fix: Add `onDelete: Cascade` to the `list` relation on `ServerListLink` in schema.prisma, then run `prisma db push`.

**AUDIT-8 [CRITICAL] Empty external URL response silently wipes all ban entries**
Delete-then-insert pattern with no empty-body guard. CDN outage or misconfigured URL returns empty body → `deleteMany` removes all entries → `createMany` inserts nothing → all bans cleared → previously banned players can join.
Affected: `apps/api/src/controllers/access-lists.ts:200-240` (refreshExternal)
(chaos-engineer C-3, penetration-tester HIGH, security-auditor note)
Fix: Add guard `if (parsed.length === 0) { log.warn('Empty response — skipping sync'); return }` before the delete+insert block.

**AUDIT-9 [CRITICAL] SQLite not in WAL mode and FK enforcement disabled**
No `PRAGMA journal_mode = WAL` (exclusive write locks block all reads), no `PRAGMA foreign_keys = ON` (all FK constraints including Cascades silently unenforced), and no `PRAGMA busy_timeout` (defaults to 0ms — immediate SQLITE_BUSY on contention).
Affected: `apps/api/src/db/prisma-client.ts`
(database-administrator C-2, sql-pro M-5, performance-engineer H-1, chaos-engineer M-4)
Fix: After constructing the `better_sqlite3` client add: `client.pragma('journal_mode = WAL'); client.pragma('foreign_keys = ON'); client.pragma('busy_timeout = 5000')`.

**AUDIT-10 [CRITICAL] No SIGTERM/SIGINT graceful shutdown handler**
`process.on('SIGTERM')` never registered. `docker stop` sends SIGTERM, waits 10s, then SIGKILL. In-flight wipes, pending DB writes, and active cron tasks are hard-killed. SQLite WAL never checkpointed.
Affected: `apps/api/src/server.ts`
(sre-engineer C-1, chaos-engineer H-5, deployment-engineer C-3, javascript-pro L-02)
Fix: Add `process.on('SIGTERM', async () => { await app.close(); process.exit(0) })` and same for `SIGINT` in `server.ts` before `app.listen()`.

**AUDIT-11 [CRITICAL] `prisma db push` used as production migration mechanism**
Entrypoint runs `prisma db push` on every container start — bypasses migrations, records no history in `_prisma_migrations`, makes rollback impossible. SQL migration files in git are never applied in production.
Affected: `docker/entrypoint-dashboard.sh`, `apps/api/prisma/migrations/`
(database-administrator C-1, sre-engineer M-note, docker-expert M-note)
Fix: Switch to `prisma migrate deploy` in the entrypoint. Baseline existing production databases first.

**AUDIT-12 [CRITICAL] `.env` file committed to git repository**
`.env` exists at repository root and is tracked by git despite being in `.gitignore` (was added before the ignore rule). Contains non-default configuration values — establishes precedent for credential exposure.
Affected: `.env` (root)
(git-workflow-manager C-1)
Fix: `git rm --cached .env` and commit the removal immediately.

**AUDIT-13 [CRITICAL] Game server container runs as root with no capability restrictions**
`Dockerfile.gameserver` creates no non-root user. Internet-exposed game binary runs as root. RCE in game grants container-root access and shared `/saves` volume corruption.
Affected: `docker/Dockerfile.gameserver`, `docker-compose.yml`
(docker-expert C-02, deployment-engineer C-6)
Fix: Add `RUN useradd --uid 1000 gameserver && USER gameserver` to Dockerfile.gameserver. Add `cap_drop: ALL` and `security_opt: no-new-privileges:true` to compose.

**AUDIT-14 [CRITICAL] Raw Docker socket mounted without proxy in base compose**
`docker-compose.yml` mounts `/var/run/docker.sock` directly — grants any compromised process inside the container full Docker API access (equivalent to root on host). No prominent warning directs operators to the secure variant.
Affected: `docker-compose.yml:105`
(docker-expert C-01, deployment-engineer C-2, security-engineer M-2)
Fix: Add a bold `WARNING` comment at the top of `docker-compose.yml` directing internet-facing deployments to `docker-compose.secure.yml`. Consider defaulting new deployments to the secure variant.

**AUDIT-15 [CRITICAL] No serverId validation on WebSocket upgrade — arbitrary server log access**
WebSocket handler passes `serverId` URL param directly to `dockerManager.getOutputBuffer(serverId)` without confirming the server exists in the database or that the user has access to it.
Affected: `apps/api/src/routes/console.ts:74`
(websocket-engineer WS-C01)
Fix: Add `prisma.server.findUnique({ where: { id: serverId } })` immediately after the role check; close with `1008` if not found.

**AUDIT-16 [CRITICAL] No right-to-erasure mechanism for Steam IDs (GDPR Article 17)**
Player Steam IDs (personal data under GDPR) exist across `PlayerRecord` table, `ListEntry` table, `PlayerData/*.json` files, `banlist.txt`/`whitelist.txt`/`adminlist.txt`, and Pino log output. No API endpoint, admin page, or utility script covers erasure across all stores.
Affected: Multiple — `apps/api/prisma/schema.prisma`, `apps/api/src/services/file-io.ts`, `apps/api/src/routes/`
(compliance-auditor C-1)
Fix: Build a `DELETE /api/players/:steamId/erase` endpoint or admin CLI utility that removes the Steam ID from all data stores atomically.

**AUDIT-17 [CRITICAL] `format: 'email'` validation silently disabled — `ajv-formats` not registered**
`setupBody` and `createUserBody` declare `format: 'email'` but Fastify/Ajv ignores `format` without `ajv-formats`. Any string passes as a valid email address.
Affected: `apps/api/src/routes/setup.ts`, `apps/api/src/routes/users.ts`
(api-designer C-3)
Fix: Install `ajv-formats` and register it on the Fastify AJV instance in `app.ts`.

**AUDIT-18 [CRITICAL] `--red-rgb` CSS variable referenced but never defined**
`apps/web/src/index.css` uses `--red-rgb` in at least one component class. It is not declared in `:root`. Elements render with `rgba(undefined)` — transparent or black depending on browser.
Affected: `apps/web/src/index.css`
(ui-designer C-1)
Fix: Add `--red-rgb: 185, 70, 70;` (or the correct value) to the `:root` block in `index.css`.

**AUDIT-19 [CRITICAL] `.dim` CSS class referenced in TSX but not defined**
At least one component applies `className="dim"` but no `.dim` rule exists in `index.css`. Visual breakage at runtime.
Affected: `apps/web/src/index.css`, component file(s) using `className="dim"`
(ui-designer C-2)
Fix: Add `.dim { opacity: 0.5; }` or the appropriate rule to `index.css`.

**AUDIT-20 [CRITICAL] Web TypeScript config emits compiled output into source tree**
`apps/web/tsconfig.json` has no `outDir` — `tsc` emits `.js`, `.d.ts`, `.js.map` directly into `apps/web/src/`. `.gitignore` has hardcoded workaround exclusions.
Affected: `apps/web/tsconfig.json`, `apps/web/src/**/*.js` (gitignored artifacts)
(build-engineer C-1)
Fix: Add `"outDir": "dist"` to `apps/web/tsconfig.json`. Change the build script to `"build": "vite build --emptyOutDir"` and type-check separately with `"typecheck": "tsc --noEmit"`.

---

### HIGH

**AUDIT-21 [HIGH] Stale closure in cron task execution**
`registerCronJob` captures `task` object at registration. DB modifications after that (via `updateSchedule`) re-register correctly from the UI, but external DB changes or future refactors that skip re-registration execute stale payloads silently.
Affected: `apps/api/src/controllers/schedule.ts:72-80`
(code-reviewer H-4, architect-reviewer H-3, chaos-engineer H-2, sre-engineer H-2)
Fix: Inside `runTask`, re-fetch the task from DB by `task.id` before executing: `const fresh = await prisma.scheduledTask.findUnique({ where: { id: task.id } })`.

**AUDIT-22 [HIGH] RCON password exposed in `listServers` API response**
`servers.ts:36` uses no `select` clause — full server row including `rconPass` returned to every authenticated user on every server list load.
Affected: `apps/api/src/controllers/servers.ts:36`
(sql-pro H-3, security-auditor H-6, penetration-tester MEDIUM, performance-engineer H-3)
Fix: Add `select` clause explicitly excluding `rconPass`, or use a `SERVER_SELECT` projection constant matching the `USER_SELECT` pattern in `users.ts`.

**AUDIT-23 [HIGH] Missing database indexes on hot query columns**
`WipeLog.serverId`, `ScheduledTask.serverId`, `ListEntry.listId`, `Session.userId`, `Account.userId` — all unindexed. Full table scans on every page load.
Affected: `apps/api/prisma/schema.prisma` (zero `@@index` declarations)
(sql-pro H-1, H-2, database-administrator M-2, performance-engineer H-4)
Fix: Add `@@index([serverId])` to `WipeLog` and `ScheduledTask`; `@@index([listId])` to `ListEntry`; `@@index([userId])` to `Session` and `Account` in schema.prisma.

**AUDIT-24 [HIGH] `BETTER_AUTH_SECRET` validation only in production — no minimum length**
Validation of the placeholder secret only runs when `NODE_ENV === 'production'`. No `minLength: 32` constraint. Staging/test deployments or production deployments that don't set `NODE_ENV` accept a 1-character secret.
Affected: `apps/api/src/plugins/env.ts:13-18`, `apps/api/src/config.ts:20`
(security-auditor H-1, security-engineer H-1, deployment-engineer H-2)
Fix: Add `minLength: 32` to the `BETTER_AUTH_SECRET` JSON schema property. Remove the `NODE_ENV` condition on the validation check.

**AUDIT-25 [HIGH] Google Fonts CDN leaks user IP to Google on every page load — GDPR violation**
`index.html` and `index.css` load fonts from `fonts.googleapis.com` and `fonts.gstatic.com`. Sends IP, user-agent, and referrer to Google without consent. German courts have ruled this a GDPR violation (LG München, 2022).
Affected: `apps/web/index.html:7-11`, `apps/web/src/index.css:1`
(compliance-auditor H-1, security-engineer note, penetration-tester INFO)
Fix: Download IBM Plex Mono and Sora font files, place in `apps/web/public/fonts/`, update `index.css` to use `@font-face` with local paths. Remove CDN `<link>` tags from `index.html`.

**AUDIT-26 [HIGH] Mass assignment — `req.body` passed directly to Prisma `update`/`create`**
`updateAccessList` and `createServer` pass `req.body` directly as Prisma `data`. Fastify removes additional properties by default only when `removeAdditional: true` is set; schemas lack `additionalProperties: false`.
Affected: `apps/api/src/controllers/access-lists.ts:47`, `apps/api/src/controllers/servers.ts:73`
(penetration-tester MEDIUM, security-auditor M-3, sql-pro H-4, api-designer H-4)
Fix: Add `additionalProperties: false` to all body schemas, or destructure only expected fields before passing to Prisma.

**AUDIT-27 [HIGH] AuthContext re-validates session on every route change — double API call per navigation**
`AuthContext.tsx:84` dependency array is `[location.pathname]`. Every navigation triggers `/api/setup` + `/api/auth/get-session` even when `user` state is already populated.
Affected: `apps/web/src/context/AuthContext.tsx:84`
(react-specialist HIGH-1, performance-engineer M-4, tooling-engineer H-2 context)
Fix: Add `if (user && !PUBLIC_PATHS.includes(location.pathname)) return` fast-path at the top of `checkAuth`.

**AUDIT-28 [HIGH] `useLiveLog` WebSocket has no reconnection on server-side close**
No `ws.onclose` or `ws.onerror` handler with retry logic. API restart leaves Console page showing a frozen, silently dead log stream.
Affected: `apps/web/src/hooks/useLiveLog.ts`
(react-specialist HIGH-2, chaos-engineer H-6, websocket-engineer WS-H01)
Fix: Add `ws.onclose = () => scheduleReconnect()` with exponential backoff. Expose a `status` field from the hook to drive the Console page connection indicator.

**AUDIT-29 [HIGH] `dockerManager.reconnect()` failure kills API process**
Inside the same `try/catch` as `app.listen()`. A transient Docker daemon restart exits the entire dashboard process.
Affected: `apps/api/src/server.ts:34`
(code-reviewer H-3, chaos-engineer H-1, sre-engineer C-3)
Fix: Wrap Docker reconnect in its own `try/catch` separate from `app.listen()`. Log a warning and continue serving non-Docker routes in degraded mode.

**AUDIT-30 [HIGH] N+1 query fan-out in `syncAllLists`**
`list-service.ts:34-35` issues 2N sequential Prisma queries inside a loop with no batching. 10 servers × 5 lists = 100 individual SQLite queries per sync cycle.
Affected: `apps/api/src/services/list-service.ts:34-35`
(sql-pro H-6, performance-engineer H-2)
Fix: Replace the loop with two `findMany` calls using `include` to load all `accessList` and `server` records upfront, then process in memory.

**AUDIT-31 [HIGH] Concurrent `syncAllLists` calls cause data loss**
Two simultaneous sync operations on the same `listId` — the second `deleteMany` removes entries inserted by the first, leaving an empty list.
Affected: `apps/api/src/services/list-service.ts`
(chaos-engineer H-4)
Fix: Implement a per-list mutex or wrap the delete+insert in a Prisma `$transaction` to prevent concurrent modification.

**AUDIT-32 [HIGH] Console.tsx log line array is unbounded — progressive memory growth**
Each log line appended to React state with no cap. `useLiveLog` caps at 1000 lines server-side but client-side accumulates indefinitely. Active server tab open for hours accumulates tens of thousands of DOM nodes.
Affected: `apps/web/src/pages/Console.tsx`
(react-specialist HIGH-4, performance-engineer H-5)
Fix: `setLines(prev => prev.slice(-999).concat(newLine))`.

**AUDIT-33 [HIGH] Single invalid scheduled task record causes `process.exit(1)` at startup**
`registerCronJob` called inside the startup error block — a single bad cron expression in the DB kills the entire API on next start.
Affected: `apps/api/src/server.ts`, `apps/api/src/controllers/schedule.ts`
(sre-engineer H-3, architect-reviewer L-7)
Fix: Wrap each `registerCronJob` call in its own `try/catch`, log the error, and continue with remaining tasks.

**AUDIT-34 [HIGH] No automated backup for SQLite database**
No cron backup, no pre-upgrade snapshot before `db push`, no UI-triggered backup. All user data, server configs, ban lists, and schedules stored in a single unprotected file.
Affected: `docker/entrypoint-dashboard.sh`, `apps/api/src/db/`
(database-administrator H-1, sre-engineer H note)
Fix: Add a pre-upgrade backup step in entrypoint: `cp /data/ormod-rcon.db /backups/ormod-rcon-$(date +%Y%m%d%H%M%S).db` before running `prisma db push`. Also add a scheduled `VACUUM` and `ANALYZE`.

**AUDIT-35 [HIGH] WebSocket `maxPayload` not configured — 100 MiB default allows memory exhaustion**
`app.register(websocket)` called with no options. Authenticated ADMIN can send a 100 MiB frame buffered in memory before the event fires.
Affected: `apps/api/src/app.ts:32`
(websocket-engineer WS-H03)
Fix: `app.register(websocket, { options: { maxPayload: 4096 } })` and register a `socket.on('message', () => socket.close(1003))` handler to reject inbound messages.

**AUDIT-36 [HIGH] No WebSocket session re-validation after upgrade — revoked users continue streaming**
Session validated once at upgrade. Deleted or demoted users continue receiving server console output until they close the tab.
Affected: `apps/api/src/routes/console.ts:60-71`
(websocket-engineer WS-H02)
Fix: Add a 60-second heartbeat interval that re-validates the session and closes the socket with `1008` on failure.

**AUDIT-37 [HIGH] No WebSocket Origin header validation — Cross-Site WebSocket Hijacking risk**
CORS restrictions do not apply to WebSocket upgrades. A cross-origin page can initiate a WebSocket connection using the victim's session cookie.
Affected: `apps/api/src/routes/console.ts:53`
(websocket-engineer WS-M01)
Fix: Validate `req.headers.origin` against the trusted origins list used by `@fastify/cors`. Close with `1008` if origin is missing or untrusted.

**AUDIT-38 [HIGH] `deleteFileOrDir` has no internal path traversal check**
`file-io.ts:88-100` performs `path.join(this.savePath, name)` with no traversal validation. All current callers validate first, but the public method is unprotected for any future caller.
Affected: `apps/api/src/services/file-io.ts:88-100`
(penetration-tester HIGH, security-auditor L, architect-reviewer L-5)
Fix: Add `assertSafePath`-style validation inside `deleteFileOrDir` as defense-in-depth.

**AUDIT-39 [HIGH] Zero reply schemas across the entire API — sensitive field leakage risk**
Every route is missing a `reply` schema. Fastify falls back to `JSON.stringify`, any new Prisma model fields (including sensitive ones) are returned verbatim. Only `USER_SELECT` projection in users controller guards fields at the code level.
Affected: All 10 route files in `apps/api/src/routes/`
(api-designer C-1)
Fix: Add reply schemas to at minimum the highest-risk routes: `listServers`, `listUsers`, `getAccessList`. At minimum define a `ServerSafeResponse` type that omits `rconPass`.

**AUDIT-40 [HIGH] `devDependencies` present in production Docker image — ~200MB bloat**
Api-builder installs all dependencies; runtime stage copies full `node_modules`. Production image contains `tsx`, `typescript`, `vitest`, `prisma` CLI.
Affected: `docker/Dockerfile.dashboard`
(docker-expert H-02, deployment-engineer H-3)
Fix: Use `pnpm deploy --filter @ormod-rcon/api --prod /app/prod-node-modules` in builder and copy only the pruned modules to runtime.

**AUDIT-41 [HIGH] Type-aware ESLint rules disabled — floating promises not caught at lint time**
`tseslint.configs.recommended` used without `languageOptions.parserOptions.project`. `no-floating-promises`, `no-misused-promises`, and `return-await` rules are all absent — the exact rules that would catch AUDIT-5 and AUDIT-6.
Affected: `eslint.config.js`
(tooling-engineer H-1)
Fix: Switch to `tseslint.configs.recommendedTypeChecked` and add `languageOptions: { parserOptions: { project: true } }`.

**AUDIT-42 [HIGH] Migration SQL contradicts `onDelete: Cascade` in schema.prisma for 4 models**
`migration.sql` defines `ON DELETE RESTRICT` for `PlayerRecord.serverId`, `WipeLog.serverId`, `ScheduledTask.serverId`, and `ServerListLink.serverId`. schema.prisma specifies `Cascade`. Non-Prisma deletions fail with FK violations.
Affected: `apps/api/prisma/migrations/`, `apps/api/prisma/schema.prisma`
(sql-pro C-1)
Fix: Reconcile migration SQL with schema.prisma. Either update the migration SQL to use `ON DELETE CASCADE` or document the Prisma emulation behavior explicitly.

**AUDIT-43 [HIGH] `deleteUser` is non-atomic — sequential deletes without transaction**
`users.ts:134-136` — three sequential `deleteMany`/`delete` calls with no `$transaction`. A crash between steps leaves orphaned sessions/accounts. The pre-deletion is also redundant since Session/Account have `onDelete: Cascade`.
Affected: `apps/api/src/controllers/users.ts:134-136`
(sql-pro C-2, refactoring-specialist M-3)
Fix: Replace the three calls with a single `prisma.user.delete({ where: { id } })` — cascades handle Session and Account automatically.

**AUDIT-44 [HIGH] `useSettings` shows stale data when switching servers**
Hook fires new fetch on `activeServer` change but `settings` still holds previous server's data until the fetch completes.
Affected: `apps/web/src/hooks/useSettings.ts`
(react-specialist HIGH-3)
Fix: Add `setSettings(null)` before the fetch to reset state on `serverId` change.

**AUDIT-45 [HIGH] No pre-commit hooks**
No Husky, no lint-staged. Combined with no CI (AUDIT-3), there is no automated enforcement point anywhere in the developer workflow.
Affected: repository root (missing `.husky/`)
(tooling-engineer C-2)
Fix: Add Husky + lint-staged: run ESLint and Prettier on staged files, run `tsc --noEmit` on pre-push.

**AUDIT-46 [HIGH] `better-sqlite3` imported directly but not declared as a direct dependency**
`prisma-client.ts` imports `better-sqlite3` directly. Only `@prisma/adapter-better-sqlite3` is in `package.json`. If pnpm's strict layout applies or the adapter changes its own dependency, the import breaks at runtime.
Affected: `apps/api/package.json`, `apps/api/src/db/prisma-client.ts`
(dependency-manager H-1)
Fix: Add `"better-sqlite3": "^11.x"` and `"@types/better-sqlite3"` to `apps/api/package.json`.

**AUDIT-47 [HIGH] `dotenv` in devDependencies but required at production runtime**
`@fastify/env` configured with `dotenv.path`, meaning `dotenv` is needed at runtime. If production image uses `--prod` install, it is missing.
Affected: `apps/api/package.json`
(dependency-manager H-2)
Fix: Move `dotenv` from `devDependencies` to `dependencies`, or remove `dotenv.path` from `@fastify/env` config and rely solely on `--env-file` in the dev script.

**AUDIT-48 [HIGH] `deleteAccessList` controller should cascade-delete entries or links first**
Currently crashes on FK constraint (or silently succeeds with FK pragma off). Separate from AUDIT-7 (schema fix) — the controller should explicitly handle the case until the schema migration is applied.
Affected: `apps/api/src/controllers/access-lists.ts:56`
(code-reviewer C-3)
Fix: As interim fix, add `await prisma.serverListLink.deleteMany({ where: { listId: id } })` before `prisma.accessList.delete()` in the controller.

**AUDIT-49 [HIGH] Missing focus indicators on all interactive elements — keyboard users cannot see focus**
CSS includes `:focus` styles only for form inputs. Buttons, nav tabs, quick-command items, sidebar items, and clickable table rows have no focus outline. WCAG 2.4.7 (Level A) failure.
Affected: `apps/web/src/index.css:811-814`, `apps/web/src/components/layout/AppShell.tsx`, multiple pages
(accessibility-tester AX-001)
Fix: Add `.btn:focus-visible, .nav-tab:focus-visible, [role="button"]:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px }` to `index.css`.

**AUDIT-50 [HIGH] Interactive div/span elements missing ARIA roles and keyboard handlers**
Clickable `<div>` and `<tr>` elements have `onClick` but no `role="button"`, no `tabIndex`, no `onKeyDown`. WCAG 4.1.2 (Level A) failure.
Affected: `apps/web/src/pages/Players.tsx:100-101`, `Console.tsx:145`, `AccessControl.tsx:364-374`, `Schedules.tsx:234-281`, `Settings.tsx:115-117`
(accessibility-tester AX-002, DEFER-7 related)
Fix: Convert to `<button>` elements, or add `role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && handler()}` to each.

**AUDIT-51 [HIGH] Modal dialogs without focus trap — keyboard focus escapes to background**
All 5 modal overlays do not trap keyboard focus. Tab navigates outside open modals; focus not returned to trigger on close. WCAG 2.4.3 (Level A) failure.
Affected: `ConfirmDialog.tsx:24-65`, `AccessControl.tsx:177-258`, `Schedules.tsx:108-196`, `ServerManagement.tsx:98-212`, `UserManagement.tsx:100-185`
(accessibility-tester AX-003)
Fix: Implement focus trap with `useEffect` constraining Tab/Shift+Tab within modal. Move initial focus to first focusable element on open. Return focus to trigger on close.

**AUDIT-52 [HIGH] Form inputs lack associated `<label>` elements — screen readers cannot announce labels**
All form inputs across Login, Setup, ChangePasswordModal, and 6 modal forms lack `<label htmlFor>` associations. WCAG 1.3.1 (Level A) failure.
Affected: `apps/web/src/pages/Login.tsx:67-90`, `Setup.tsx:82-130`, `components/ui/ChangePasswordModal.tsx:80-93`, all form modals
(accessibility-tester AX-004)
Fix: Add `<label htmlFor="field-id">` paired with `<input id="field-id">` on all form inputs.

**AUDIT-53 [HIGH] Color contrast insufficient for muted text — WCAG 1.4.3 (Level AA) failure**
`--muted: #888a7c` on `--bg0: #0e0f0d` fails 4.5:1 minimum contrast ratio. `--dim: #4a4c42` on `--bg0` fails even more severely. Affects secondary text, placeholders, and permission badges.
Affected: `apps/web/src/index.css:33-35, 140-157, 432-489`
(accessibility-tester AX-005)
Fix: Increase `--muted` to `#a0a295` and `--dim` to `#6a6c62` minimum. Verify with WebAIM Contrast Checker.

**AUDIT-54 [HIGH] Table `<th>` elements missing `scope` attributes — WCAG 1.3.1 (Level A) failure**
All data tables lack `scope="col"` on header cells. Screen readers cannot associate headers with data cells.
Affected: `Players.tsx:74-79`, `AccessControl.tsx:485-492`, `WipeManager.tsx:215-222`, `UserManagement.tsx:232-239`
(accessibility-tester AX-006)
Fix: Add `scope="col"` to all `<th>` elements — a 5-minute change.

**AUDIT-55 [HIGH] `pnpm dev` missing at workspace root — first command every new contributor runs fails**
Root `package.json` has no `dev` script. CLAUDE.md says `pnpm dev` starts both servers but it fails with script-not-found.
Affected: root `package.json`
(dx-optimizer C-1, dependency-manager L-2)
Fix: Add `"dev": "pnpm -r --parallel dev"` to root `package.json`.

**AUDIT-56 [HIGH] `fileAccess` capability flag is always true — BACKUP_PATH default makes check meaningless**
`capabilities.ts` computes `fileAccess = Boolean(config.SAVE_BASE_PATH || config.SAVES_PATH || config.BACKUP_PATH)`. `BACKUP_PATH` defaults to `'./backups'` (non-empty), so `fileAccess` is always `true` even without a saves volume mounted.
Affected: `apps/api/src/controllers/capabilities.ts:34`
(api-designer C-2, code-reviewer L)
Fix: Remove `config.BACKUP_PATH` from the `fileAccess` computation. Only `SAVES_PATH` and `SAVE_BASE_PATH` indicate that save-directory features are available.

**AUDIT-57 [HIGH] Linger timeout not stored — fires after quick restart and deletes live buffer**
`setTimeout` for buffer/emitter deletion after container stop is not stored. A container restarted within 60 seconds gets a new buffer, but the old timer fires after 60s and deletes the live entries.
Affected: `apps/api/src/services/docker-manager.ts:400-403`
(javascript-pro H-03)
Fix: Store timer IDs in `private lingerTimers = new Map<string, ReturnType<typeof setTimeout>>()`. Cancel existing timer before starting a new log stream for the same `serverId`.

**AUDIT-58 [HIGH] `useSettings` and `ServerContext` stale data / non-memoized context value**
`ServerContext` value object is an inline literal recreated on every render — all 10+ consumers re-render on any state change. `activeServer` computed with `servers.find()` on every render with no `useMemo`.
Affected: `apps/web/src/context/ServerContext.tsx`
(react-specialist MEDIUM-1, performance-engineer M-5)
Fix: Wrap context value with `useMemo(() => ({ servers, activeServer, ... }), [servers, activeServer])`.

---

### MEDIUM

**AUDIT-59 [MEDIUM] No response body size limit on external URL fetch — OOM risk**
`refreshExternal` fetches external URLs with no byte limit. Multi-gigabyte response buffers entirely in the Node.js heap before processing.
Affected: `apps/api/src/controllers/access-lists.ts` (refreshExternal)
(penetration-tester HIGH, performance-engineer C-1, code-reviewer M)
Fix: Track accumulated response size and abort with an error when it exceeds 10 MB.

**AUDIT-60 [MEDIUM] No timeout on `dockerRequest` calls**
Docker API calls over the Unix socket have no timeout. Hung Docker daemon blocks all handlers waiting for Docker responses indefinitely.
Affected: `apps/api/src/services/docker-manager.ts`
(chaos-engineer M-2)
Fix: Add `AbortSignal.timeout(30_000)` to all `dockerRequest` calls.

**AUDIT-61 [MEDIUM] `updateSchedule` unregisters cron job before DB update — permanent job loss on DB failure**
Existing cron job stopped and removed from `cronJobs` Map, then Prisma update runs. If Prisma throws, the cron job is gone until server restart.
Affected: `apps/api/src/controllers/schedule.ts:141-148`
(chaos-engineer M-1, database-administrator M-4, sql-pro M-4)
Fix: Update DB first, then unregister+re-register the cron job. If DB update fails, old cron job continues correctly.

**AUDIT-62 [MEDIUM] `deleteFileOrDir` swallows `EACCES`/`EBUSY` — partial wipe appears successful**
`file-io.ts` catch block returns success for all errors. A permission-denied or busy-file error during wipe is invisible to the caller.
Affected: `apps/api/src/services/file-io.ts:88-100`
(chaos-engineer C-4, javascript-pro L-04)
Fix: Only swallow `ENOENT`; re-throw all other error codes (`EACCES`, `EBUSY`, `EIO`, etc.).

**AUDIT-63 [MEDIUM] `readSettings`/`readList` swallow all errors as "file not found"**
`file-io.ts` returns empty defaults for `EACCES`, `EIO`, and JSON parse errors — all treated the same as missing file. A corrupt `serversettings.json` returns `{}` silently and a subsequent write destroys the original file.
Affected: `apps/api/src/services/file-io.ts:17-24, 41-48`
(javascript-pro L-03, code-reviewer M)
Fix: Only swallow `ENOENT`; re-throw other errors so callers can return a proper 500.

**AUDIT-64 [MEDIUM] CORS origins computed with HTTP-only URLs — TLS breaks CORS**
`computeOrigins` generates only `http://` URLs. If TLS is configured and `PUBLIC_URL` is not set, browser sends `Origin: https://...` but server allows only `http://` origins.
Affected: `apps/api/src/config.ts:68`
(code-reviewer M)
Fix: Detect `TLS_CERT_PATH` presence and generate `https://` origins when TLS is enabled.

**AUDIT-65 [MEDIUM] `HSTS` sent on HTTP if TLS cert path is set but cert doesn't exist**
`helmet.ts` enables HSTS based on `TLS_CERT_PATH` string presence, not actual TLS state. If cert is configured but missing, HSTS is sent over plain HTTP — locks users out for up to 1 year.
Affected: `apps/api/src/plugins/helmet.ts:12`
(code-reviewer M)
Fix: Check that both cert and key files are readable (not just that the env var is set) before enabling HSTS.

**AUDIT-66 [MEDIUM] Wipe service backup/restore error handling incomplete**
Backup runs outside the `try` block — backup failure aborts with undefined log state. Recovery restart failure on error path is silently swallowed with a placeholder comment.
Affected: `apps/api/src/services/wipe-service.ts`
(chaos-engineer C-2, javascript-pro M-04)
Fix: Move backup inside the `try` block. Add explicit logging on recovery restart failure. Add a `catch` that attempts restore from the backup path on deletion failure.

**AUDIT-67 [MEDIUM] deleteServer does not clean up in-memory cron jobs**
Orphaned cron jobs continue running after server deletion until the next process restart.
Affected: `apps/api/src/controllers/servers.ts:77-87`
(code-reviewer M)
Fix: When deleting a server, also call `unregisterCronJob` for all `ScheduledTask` records linked to that server before the Prisma delete.

**AUDIT-68 [MEDIUM] No string length limits on any user-controlled input across the API**
Zero `maxLength` constraints on any string field across all 10 route files. Authenticated users can submit arbitrarily large strings for names, paths, commands, payloads.
Affected: All route files in `apps/api/src/routes/`
(api-designer H-2, security-auditor M — command body maxLength)
Fix: Add `maxLength` to at minimum: `command` (4096), `cronExpr` (100), `name`/`note` fields (255), `savePath` (500). Add `maxItems: 100` to `customFiles` array in wipe body.

**AUDIT-69 [MEDIUM] `listBody.scope` optional — null scope crashes `ScopeBadge` in frontend**
Creating an access list without specifying scope produces `null` scope; `scope.toLowerCase()` throws in the frontend component.
Affected: `apps/api/src/routes/access-lists.ts`, `apps/web/src/` (ScopeBadge usage)
(api-designer L-7)
Fix: Add `scope` to the `required` array in `listBody` schema, or add a Prisma default.

**AUDIT-70 [MEDIUM] `permission` field for adminlist entries is free-form — injection risk**
Values written directly to `adminlist.txt` as `${steamId}:${permission}`. No validation against allowed values. Newline injection could add arbitrary entries.
Affected: `apps/api/src/routes/access-lists.ts:50`, `apps/api/src/services/list-service.ts`
(security-auditor M, penetration-tester MEDIUM)
Fix: Add `enum: ['server', 'admin', 'operator', 'client']` to the `permission` property in `entryBody`.

**AUDIT-71 [MEDIUM] Incorrect/stale documentation — Prisma client output path and env variable names**
CLAUDE.md says generated client is at `src/generated/prisma/`; actual path is `prisma/generated/`. README references `DASHBOARD_HOST`/`DASHBOARD_PORT` (removed). ESLint ignore paths reference wrong generated path. `.env.example` incorrectly describes `WEB_HOST`/`WEB_PORT` behavior in Docker.
Affected: `CLAUDE.md`, `README.md`, `.env.example`, `eslint.config.js`
(documentation-engineer H-2, C-2, sql-pro M-7, database-administrator M-5, git-workflow-manager M-1, dx-optimizer C-2)
Fix: Update CLAUDE.md Prisma path reference. Update README env var names. Add comment to `.env.example` that `WEB_HOST`/`WEB_PORT` are dev-only. Correct ESLint ignore paths.

**AUDIT-72 [MEDIUM] `errors` universally swallowed in `.catch(console.error)` — users see no feedback**
All 11 pages swallow fetch errors with `.catch(console.error)`. Users see no indication that a server request failed. The UI stays silently in loading or empty state.
Affected: All pages in `apps/web/src/pages/`
(react-specialist MEDIUM-2)
Fix: Set an `error` state on failure and display an inline error message using the design system.

**AUDIT-73 [MEDIUM] No data retention policy — expired sessions, verification tokens, and wipe logs accumulate indefinitely**
Sessions expired by `expiresAt` are never pruned. Verification tokens with past `expiresAt` are never deleted. `ListEntry.expiresAt` exists but nothing checks or prunes expired bans.
Affected: `apps/api/prisma/schema.prisma`, `apps/api/src/`
(compliance-auditor C-2)
Fix: Add a `node-cron` scheduled job that runs nightly: `prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })` and same for `Verification`.

**AUDIT-74 [MEDIUM] PII (Steam IDs and IP addresses) in Pino log output with no redaction**
Fastify `{ logger: true }` logs client IP on every request and full URL paths including Steam IDs (e.g., `GET /api/players/76561198001234567`). No custom serializer to redact PII.
Affected: `apps/api/src/app.ts:22`
(compliance-auditor H-3)
Fix: Add a Pino serializer that redacts IP addresses from request logs and masks Steam IDs in URL paths.

**AUDIT-75 [MEDIUM] `docker-manager.ts` response stream has no `error` event listener**
`res.on('error', ...)` missing from `dockerRequest`. Mid-response connection drop on `res` emits an unhandled error event.
Affected: `apps/api/src/services/docker-manager.ts:86-101`
(javascript-pro M-02)
Fix: Add `res.on('error', reject)` inside the `http.request` callback alongside the existing `req.on('error', reject)`.

**AUDIT-76 [MEDIUM] `refreshExternal` response stream has no `error` event listener**
Same pattern as AUDIT-75 — external feed server dropping mid-response produces an unhandled error.
Affected: `apps/api/src/controllers/access-lists.ts`
(javascript-pro M-05)
Fix: Add `res.on('error', (err) => { clearTimeout(timer); reject(err) })` inside the `handleResponse` function.

**AUDIT-77 [MEDIUM] `_attachAndWrite` socket has no `error` listener before `socket.write`**
Docker exec upgrade socket has no `error` listener registered. `EPIPE` or `ECONNRESET` during `socket.write` fires an unhandled error event.
Affected: `apps/api/src/services/docker-manager.ts:271-276`
(javascript-pro M-03)
Fix: `socket.on('error', (err) => reject(err))` before `socket.write`.

**AUDIT-78 [MEDIUM] No `engines` field — wrong Node version produces cryptic errors**
Node 20+ is required (Fastify 5 + Prisma 7) but not declared in any `package.json`. Developers on Node 18 see cryptic runtime errors.
Affected: root `package.json`, `apps/api/package.json`, `apps/web/package.json`
(tooling-engineer H-4, dependency-manager M-3, dx-optimizer L-3)
Fix: Add `"engines": { "node": ">=20.0.0", "pnpm": ">=10.0.0" }` to all three `package.json` files.

**AUDIT-79 [MEDIUM] No audit trail for admin actions beyond wipe logs**
Ban/unban, whitelist changes, console commands, server start/stop/restart, user management, and settings changes generate no structured audit record.
Affected: Multiple controllers — `servers.ts`, `access-lists.ts`, `console.ts`, `users.ts`
(sre-engineer M-6, compliance-auditor M-2, deployment-engineer M-1)
Fix: Add an `AuditLog` Prisma model with `action`, `userId`, `targetId`, `metadata`, `createdAt`. Emit audit events from key controller actions. Provide a read-only `GET /api/audit` endpoint for OWNER role.

**AUDIT-80 [MEDIUM] `db:migrate` script uses `prisma migrate dev` — not safe for production**
Running `prisma migrate dev` in production prompts interactively or creates unexpected migration files.
Affected: `apps/api/package.json`
(dependency-manager M-2)
Fix: Rename to `db:migrate:dev`. Add `"db:deploy": "prisma migrate deploy"` for production use.

**AUDIT-81 [MEDIUM] Error messages from `window.alert()` expose internal API path structure**
`api/client.ts` throws `Error(\`${method} ${path} → ${res.status}: ${text}\`)` where `text` is the raw server response. Frontend pages call `alert((e as Error).message)` — raw API internals shown in OS dialog.
Affected: `apps/web/src/api/client.ts`, all pages using `alert()`
(api-designer H-1, react-specialist LOW-3, ui-designer H-3)
Fix: Implement a toast/notification component. Parse error responses and display only the `error` field message, not the full response body.

**AUDIT-82 [MEDIUM] CSRF cookie does not set `secure: true` in HTTP deployments**
CSRF token cookie transmitted over unencrypted connections in HTTP-only deployments.
Affected: `apps/api/src/plugins/csrf.ts:14-18`
(security-auditor M-1)
Fix: Set `secure: true` conditionally based on `TLS_CERT_PATH` presence, mirroring the existing HSTS logic pattern.

**AUDIT-83 [MEDIUM] `PUBLIC_PREFIXES` uses `startsWith` matching — future routes under public prefix bypass auth**
Any future route added under `/api/setup/*` would bypass authentication. Currently safe but fragile.
Affected: `apps/api/src/plugins/auth.ts:7-13`
(penetration-tester MEDIUM)
Fix: Use exact-match for fixed-path public routes. Reserve `startsWith` only for `/api/auth` which genuinely needs prefix matching.

**AUDIT-84 [MEDIUM] `session as SessionData` cast — BetterAuth `role` field not statically typed**
BetterAuth's `additionalFields` (`role`) are not in `getSession()` return type. The cast provides no guarantee `session.user.role` is a valid `UserRole`. Every RBAC decision flows through this.
Affected: `apps/api/src/plugins/auth.ts:42`, `apps/api/src/routes/console.ts:68`
(typescript-pro H1, H2)
Fix: Add a runtime guard after the cast: `if (!['OWNER', 'ADMIN', 'VIEWER'].includes(session.user.role)) throw new Error(...)`. Extract to a shared `assertSessionRole(session)` function used in both files.

**AUDIT-85 [MEDIUM] No admin action audit trail for GDPR — ban/unban decisions not logged**
External ban list imports and individual ban decisions have no provenance tracking. No per-entry data processing agreement.
Affected: `apps/api/src/controllers/access-lists.ts`
(compliance-auditor H-4)
Fix: Track `importedFrom` URL and `importedAt` timestamp on `ListEntry` records created by `refreshExternal`. This is a separate concern from AUDIT-79 (general audit trail).

**AUDIT-86 [MEDIUM] `window.alert()` and `window.prompt()` used across 8+ pages**
OS-native dialogs block the UI thread, use browser chrome not matching the design system, and are inaccessible to screen readers.
Affected: 8+ pages, `Players.tsx` (window.prompt for broadcast)
(ui-designer H-3, H-4, react-specialist LOW-3, LOW-4)
Fix: Implement a toast component and an inline modal input component using the existing design system CSS classes.

**AUDIT-87 [MEDIUM] No `pnpm test` at workspace root**
`pnpm test` from root fails with script-not-found. Developers must `cd apps/api` to run the test suite.
Affected: root `package.json`
(tooling-engineer M-6, dx-optimizer H-2, dependency-manager L-3)
Fix: Add `"test": "pnpm --filter @ormod-rcon/api test"` to root `package.json`.

**AUDIT-88 [MEDIUM] `docker-compose.yml` uses `network_mode: host` — no network isolation**
Base compose eliminates all container network isolation. Secure compose correctly uses bridge networking.
Affected: `docker-compose.yml:85`
(docker-expert M-06, security-auditor L)
Fix: Add a comment in `docker-compose.yml` explaining the network_mode: host choice and explicitly noting that `docker-compose.secure.yml` uses isolated bridge networking for production.

**AUDIT-89 [MEDIUM] Missing ARIA on modals — no `role="dialog"`, `aria-modal`, `aria-labelledby`**
All modal overlays lack ARIA dialog semantics. Background content is not inert to assistive technology when a modal is open. Close buttons missing `aria-label`. Error messages missing `role="alert"`.
Affected: All 5 modal components, error message containers in Login/Setup/ChangePasswordModal
(accessibility-tester AX-009, AX-011, AX-013)
Fix: Add `role="dialog" aria-modal="true" aria-labelledby="modal-title-id"` to modal root elements. Add `aria-label="Close dialog"` to close buttons. Add `role="alert"` to error message divs.

**AUDIT-90 [MEDIUM] Toggle switches in Settings/WipeManager/Schedules are divs — not keyboard accessible**
Toggle switch divs with `onClick` cannot be activated with keyboard. WCAG 2.1.1 Level A failure.
Affected: `Settings.tsx:114-118`, `WipeManager.tsx:313-323`, `Schedules.tsx:177-180`
(accessibility-tester AX-010)
Fix: Use `<input type="checkbox">` with CSS custom styling, or convert to `<button role="switch" aria-checked={value}>`.

---

### LOW

**AUDIT-91 [LOW] `UserRole`, `ServerMode`, `AccessListType`, `AccessListScope` types are dead exports in `types.ts`**
All four types exist in `types.ts` but have zero consumers — routes use string literals directly. Create the illusion of a shared type layer with no enforcement.
Affected: `apps/api/src/types.ts`
(refactoring-specialist H-1)
Fix: Either add proper consumers throughout the routes (add type safety), or remove them and import directly from generated Prisma types.

**AUDIT-92 [LOW] Docker base image tags not pinned to digest — non-reproducible builds**
All `FROM` instructions use floating version tags (`node:20-slim`, `ubuntu:22.04`). Upstream tag mutation can silently produce different binaries.
Affected: `docker/Dockerfile.dashboard`, `docker/Dockerfile.gameserver`
(docker-expert H-01, deployment-engineer C-4)
Fix: Pin to SHA256 digest: `FROM node:20-slim@sha256:<digest>`. Add Renovate or Dependabot to track upstream digest changes.

**AUDIT-93 [LOW] No container resource limits in either compose file**
Neither `mem_limit`, `cpus`, nor `deploy.resources` defined. A misbehaving game server or memory leak can OOM the entire host.
Affected: `docker-compose.yml`, `docker-compose.secure.yml`
(docker-expert H-05, sre-engineer H-5, deployment-engineer H-6)
Fix: Add `deploy: resources: limits: memory: 1G cpus: '2'` to the dashboard service and appropriate limits to the game service.

**AUDIT-94 [LOW] `prisma.config.ts` copied from host context in runtime stage — can diverge from builder**
Runtime stage copies `prisma.config.ts` from build context, not from the `api-builder` layer where it was used during `prisma generate`.
Affected: `docker/Dockerfile.dashboard:80`
(docker-expert M-03, deployment-engineer M-6)
Fix: `COPY --from=api-builder /app/apps/api/prisma.config.ts ./apps/api/`.

**AUDIT-95 [LOW] `console.error`/`console.warn` in service layer bypasses Fastify Pino logger**
Three instances in `docker-manager.ts` and `controllers/schedule.ts` use `console.*` directly — lose structured JSON format and log-level filtering.
Affected: `apps/api/src/services/docker-manager.ts:441`, `apps/api/src/controllers/schedule.ts:62,74`
(code-reviewer M, architect-reviewer L-4, sre-engineer H-1)
Fix: Replace with `app.log.error(...)` / `app.log.warn(...)`. Pass the Fastify logger instance to services that need it.

**AUDIT-96 [LOW] `serverParams` schema duplicated across 6+ route files**
The `{ id: { type: 'string' } }` params schema is inline-defined in every route. Should be a shared constant.
Affected: Multiple files in `apps/api/src/routes/`
(architect-reviewer L-6)
Fix: Extract to `apps/api/src/routes/_schemas.ts` and import in all route files.

**AUDIT-97 [LOW] `useServer` hook is a 3-line re-export shim with no abstraction value**
All 10+ consumers could import `useContext(ServerContext)` directly from `ServerContext.tsx`. The shim creates unnecessary indirection.
Affected: `apps/web/src/hooks/useServer.ts`
(refactoring-specialist H-2)
Fix: Delete `useServer.ts` and update all consumers to `import { useContext } from 'react'; import { ServerContext } from '../context/ServerContext'`, or keep the hook but note it is purely a convenience shim.

**AUDIT-98 [LOW] Role-to-CSS-class ternary duplicated in `UserManagement.tsx` and `AppShell.tsx`**
Same conditional mapping defined independently in two files. A third role requires editing both.
Affected: `apps/web/src/pages/UserManagement.tsx`, `apps/web/src/components/layout/AppShell.tsx`
(refactoring-specialist H-3, ui-designer L-2)
Fix: Extract `roleToClass(role: string): string` to `apps/web/src/lib/constants.ts`.

**AUDIT-99 [LOW] `SAVE_BASE_PATH` defaults to empty string — path confinement silently disabled**
`validateSavePath` confinement check is disabled by default. An OWNER could set `savePath` to `/etc` or any readable directory.
Affected: `apps/api/src/config.ts:26-27`
(penetration-tester LOW, security-auditor M, security-engineer L-2)
Fix: Document in `.env.example` that `SAVE_BASE_PATH` is strongly recommended in production. Consider defaulting to `/saves` in Docker contexts.

**AUDIT-100 [LOW] `SteamCMD` downloaded without checksum verification in Dockerfile.gameserver**
Tarball piped directly to `tar` with no SHA256 verification. HTTPS mitigates active MITM but not a compromised CDN.
Affected: `docker/Dockerfile.gameserver:41-43`
(docker-expert H-04, deployment-engineer L-3)
Fix: Add `echo "<expected-sha256>  steamcmd_linux.tar.gz" | sha256sum --check` after download.

**AUDIT-101 [LOW] `.gitattributes` missing — CRLF line endings risk on Windows**
No `.gitattributes`. On Windows, `pnpm format` may commit CRLF. Docker/CI runs Linux. Diffs polluted by invisible whitespace.
Affected: repository root
(git-workflow-manager M-4, tooling-engineer L-1 related)
Fix: Create `.gitattributes` with `* text=auto` and `*.ts text eol=lf`, `*.tsx text eol=lf`, `*.json text eol=lf`.

**AUDIT-102 [LOW] `vite.config.ts` and `prisma.config.ts` excluded from TypeScript type checking**
Both config files are outside the `include` scope of their respective tsconfigs. Latent type errors in these files are never caught.
Affected: `apps/web/tsconfig.json`, `apps/api/tsconfig.json`
(tooling-engineer H-3)
Fix: Add a separate `tsconfig.node.json` in each app for config files, or extend `include` to cover them.

**AUDIT-103 [LOW] Pino logger not configured for JSON output — no `LOG_LEVEL` env var**
`Fastify({ logger: true })` uses Pino defaults. No production vs. development logger configuration. No `LOG_LEVEL` env var in schema.
Affected: `apps/api/src/app.ts:22`, `apps/api/src/config.ts`
(sre-engineer H-1)
Fix: Configure `Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })`. Add `LOG_LEVEL` to env schema. Use JSON transport in production, pretty-print in development.

**AUDIT-104 [LOW] `react-hooks/exhaustive-deps` set to `'warn'` not `'error'`**
Stale closures easily ignored as lint warnings. The missing dependency that causes AUDIT-27 (AuthContext re-validation) falls into exactly this category.
Affected: `eslint.config.js`
(tooling-engineer H-2)
Fix: Change `'react-hooks/exhaustive-deps': 'warn'` to `'react-hooks/exhaustive-deps': 'error'`.

**AUDIT-105 [LOW] No `SECURITY.md` or responsible disclosure policy**
No documented process for security researchers to report vulnerabilities. GitHub's private vulnerability reporting is not configured.
Affected: repository root (missing `SECURITY.md`)
(security-engineer H-2)
Fix: Add `SECURITY.md` with: supported versions, how to report, expected response timeline.

**AUDIT-106 [LOW] Base images not pinned, devDependencies in production, no BuildKit cache mounts**
Three separate Docker optimization gaps: floating image tags, full `node_modules` in runtime, and no `--mount=type=cache` for pnpm store.
Affected: `docker/Dockerfile.dashboard`
(build-engineer H-2, H-4)
Fix: Add `# syntax=docker/dockerfile:1`. Use `RUN --mount=type=cache,target=/root/.pnpm-store pnpm install --frozen-lockfile`. Change web build script to `vite build --emptyOutDir` (skip redundant `tsc` pass).

**AUDIT-107 [LOW] `deleteEntry` catch-all returns 404 for all errors including DB failures**
`access-lists.ts:91-100` bare `catch {}` returns `404 Entry not found` for any error, masking real DB connection failures.
Affected: `apps/api/src/controllers/access-lists.ts:91-100`
(javascript-pro M-01)
Fix: Distinguish Prisma P2025 ("record not found") from other errors; re-throw non-P2025 errors as 500.

**AUDIT-108 [LOW] `wipe-service.ts` recovery restart failure silently swallowed**
Error path on recovery restart has a placeholder comment with no actual logging. Operator cannot know the server failed to come back up after a wipe.
Affected: `apps/api/src/services/wipe-service.ts:117-122`
(javascript-pro M-04)
Fix: `catch (startErr) { app.log.error({ err: startErr }, '[wipe] Recovery restart failed') }`.

**AUDIT-109 [LOW] Expired ban entries (`ListEntry.expiresAt`) not enforced**
Field exists but nothing checks or prunes expired bans. Expired bans persist indefinitely.
Affected: `apps/api/prisma/schema.prisma`, `apps/api/src/services/list-service.ts`
(compliance-auditor L-3)
Fix: Add expired-entry check to `writeList` in `list-service.ts`: filter out entries where `expiresAt` is set and in the past before writing to disk files.

**AUDIT-110 [LOW] `Console.tsx` uses index-based keys for log lines — React reconciliation issues**
`key={\`${l.cls}-${i}\`}` — index-based keys cause unnecessary DOM reconciliation when lines are prepended or scroll-trimmed.
Affected: `apps/web/src/pages/Console.tsx`
(react-specialist MEDIUM-4)
Fix: Use stable IDs for log lines. The `lineId` counter in `useLiveLog` provides a monotonic ID — include it in the `LogLine` type and use it as the React key.

**AUDIT-111 [LOW] No `VACUUM` or `ANALYZE` scheduling for SQLite**
SQLite databases fragment over time. No scheduled maintenance. Query planner statistics become stale.
Affected: `apps/api/src/db/prisma-client.ts`, `apps/api/src/services/`
(database-administrator M-1)
Fix: Add a weekly `node-cron` task: `client.pragma('wal_checkpoint(TRUNCATE)'); client.exec('VACUUM'); client.exec('ANALYZE')`.

---

### Notes

**Total AUDIT items**: 111 (AUDIT-1 through AUDIT-111)
**Severity breakdown**: 20 CRITICAL, 38 HIGH, 31 MEDIUM, 22 LOW

**Top 5 highest-impact fixes (effort vs. blast radius):**

1. **AUDIT-9** — 3 lines in `prisma-client.ts`: WAL mode + FK enforcement + busy_timeout. Fixes 4 cross-cutting CRITICAL/HIGH groups (concurrent read locks, silent FK bypass, immediate SQLITE_BUSY).
2. **AUDIT-4 + AUDIT-5 + AUDIT-6** — Fix `dockerRequest` status check (5 lines) + add `await` to cron callback (1 line) + add `.catch()` to floating inspect promise (2 lines). Eliminates the three most likely process-crashing bugs in production.
3. **AUDIT-10** — 2 lines in `server.ts`: `process.on('SIGTERM', ...)` + `process.on('SIGINT', ...)`. Eliminates all dirty-shutdown scenarios — every `docker stop` is currently a crash.
4. **AUDIT-25** — Self-host Google Fonts (download 2 font families, update 2 files). Eliminates immediate operator GDPR liability with zero functional change.
5. **AUDIT-3** — Add GitHub Actions CI workflow. Turns all 111 findings into automatically-enforced gates rather than advisory-only rules going forward.

Full findings in `docs/audit/findings/` — one file per specialist agent.
