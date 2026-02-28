# TODO

## Outstanding Features

- Live player online status (requires RCON response parsing or stdin output parsing — game doesn't currently expose this over exec stdin)

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
