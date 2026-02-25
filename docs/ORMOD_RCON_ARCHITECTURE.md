# ORMOD: Directive — Community RCON Dashboard
## Architecture & Implementation Guide

---

## Overview

**ormod-rcon** is a self-hosted, open-source server management dashboard for ORMOD: Directive dedicated servers. The goal is a community tool comparable to what RustAdmin or RCON Web Admin provides for Rust, purpose-built for ORMOD with first-class support for the game's file-based config system, multi-server management, and future WebSocket RCON when the game adds it.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 18 + TypeScript + Vite | Fast DX, strong typing, great ecosystem |
| Styling | Tailwind CSS v4 | Utility-first, no runtime cost, easy theming |
| API | Node.js + Fastify + TypeScript | Lightweight, schema validation, fast |
| Database | SQLite via Prisma ORM | Zero-setup, file-based, perfect for a self-hosted tool |
| Realtime | WebSocket (ws + @fastify/websocket) | Stream server output and player events live to the UI |
| Auth | Better Auth (session-based) | Simple, self-hosted, no external service needed |
| Process mgmt | Docker socket (native Node.js `http`) | Controls game container without a sidecar agent |
| Scheduling | node-cron | Scheduled wipes, announcements, restarts |
| Containerisation | Docker + Docker Compose | Single `docker compose up` to run everything |
| Config | dotenv / env vars | Secrets stay out of code |

---

## Docker Architecture

Two containers, one named volume, one Docker socket mount.

```
┌──────────────────────────┐   game-saves volume   ┌───────────────────────────────┐
│   ormod-game             │ ←──── /saves ────────→ │   ormod-dashboard             │
│                          │                        │                               │
│  Ubuntu 22.04            │                        │  Node.js 20                   │
│  ORMODDirective binary   │                        │  Fastify REST/WS API          │
│  Writes save files       │                        │  + compiled React static UI   │
│  Reads adminlist etc.    │                        │  port 3000                    │
└──────────────────────────┘                        └───────────────────────────────┘
         ↑ stdin via docker exec                              ↑
         └──────────────────────────────────────────────────┘
                         /var/run/docker.sock
```

### Why Docker socket instead of a sidecar agent?

The Docker Engine exposes a full HTTP API over a Unix socket at `/var/run/docker.sock`. Mounting the socket in the dashboard container gives it the ability to:
- Start, stop, and restart the game container
- Stream the game's stdout/stderr via `GET /containers/{name}/logs?follow=true`
- Execute commands in the game container via `POST /containers/{name}/exec`

This requires **zero additional packages** — Node.js's built-in `http` module handles Unix socket connections via the `socketPath` option.

### Why one combined dashboard container?

- Single port to expose (3000)
- Simpler compose file
- No nginx, no separate static server
- Fastify serves the compiled React build via `@fastify/static` in production

---

## Process Management — Docker API

All game process operations go through the Docker HTTP API at `unix:///var/run/docker.sock`.

### Starting/stopping the game container

```typescript
// Using Node.js built-in http module — no external package
import http from 'http';

function dockerRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      socketPath: '/var/run/docker.sock',
      method,
      path,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data ? JSON.parse(data) : {}));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Start: POST /containers/ormod-game/start
await dockerRequest('POST', `/containers/${containerName}/start`);

// Stop: POST /containers/ormod-game/stop
await dockerRequest('POST', `/containers/${containerName}/stop`);

// Restart: POST /containers/ormod-game/restart
await dockerRequest('POST', `/containers/${containerName}/restart`);
```

### Streaming game output (log lines)

```typescript
// GET /containers/ormod-game/logs?follow=true&stdout=true&stderr=true
// Docker multiplexes stdout/stderr into 8-byte framed chunks
// Frame header: [stream_type(1), 0,0,0, size(4 bytes big-endian)]

function streamLogs(containerName: string, onLine: (line: string) => void): () => void {
  const req = http.request({
    socketPath: '/var/run/docker.sock',
    method: 'GET',
    path: `/containers/${containerName}/logs?follow=true&stdout=true&stderr=true&tail=0`,
  }, (res) => {
    let buf = Buffer.alloc(0);
    res.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      // Parse Docker log multiplexing frames
      while (buf.length >= 8) {
        const frameSize = buf.readUInt32BE(4);
        if (buf.length < 8 + frameSize) break;
        const line = buf.subarray(8, 8 + frameSize).toString('utf-8').trimEnd();
        if (line) onLine(line);
        buf = buf.subarray(8 + frameSize);
      }
    });
  });
  req.end();
  return () => req.destroy(); // stop streaming on WebSocket close
}
```

### Sending commands to game stdin (docker exec)

```typescript
// Step 1: Create exec instance
const exec = await dockerRequest('POST', `/containers/${containerName}/exec`, {
  AttachStdin: false,
  AttachStdout: false,
  AttachStderr: false,
  Tty: false,
  Cmd: ['sh', '-c', `echo '${cmd}' > /proc/1/fd/0`],
});

// Step 2: Start the exec
await dockerRequest('POST', `/exec/${exec.Id}/start`, { Detach: true });
```

The `/proc/1/fd/0` trick writes directly to the game process's stdin file descriptor without needing a controlling terminal. This works because the game container is started with `stdin_open: true` and `tty: true`.

---

## RCON Abstraction Layer

The game currently only supports commands via Docker exec. RCON WebSocket is coming. The `rcon-adapter.ts` service abstracts over both so routes never change:

```typescript
// src/services/rcon-adapter.ts

export interface RconAdapter {
  sendCommand(cmd: string): Promise<string>;
  isConnected(): boolean;
}

// Current: Docker exec to /proc/1/fd/0
export class DockerExecAdapter implements RconAdapter {
  constructor(private containerName: string) {}

  async sendCommand(cmd: string): Promise<string> {
    await dockerExec(this.containerName, cmd);
    return 'Command dispatched via docker exec';
  }

  isConnected(): boolean {
    return true; // container running = connected
  }
}

// Future: WebSocket RCON (implement when game adds it)
export class WebSocketRconAdapter implements RconAdapter {
  private ws: WebSocket | null = null;

  async connect(host: string, port: number, pass: string): Promise<void> {
    // Similar to Facepunch webrcon protocol
    throw new Error('RCON not yet implemented by game');
  }

  async sendCommand(cmd: string): Promise<string> {
    // Send JSON packet, await response
    throw new Error('RCON not yet implemented by game');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Factory: routes always call getAdapter(), never the adapter directly
export function getAdapter(server: { id: string; rconPort?: number | null; rconPass?: string | null }): RconAdapter {
  if (server.rconPort && server.rconPass) {
    return new WebSocketRconAdapter(); // future
  }
  const containerName = process.env.GAME_CONTAINER_NAME ?? 'ormod-game';
  return new DockerExecAdapter(containerName); // current
}
```

**Migration path:** When RCON lands, add `rconPort` + `rconPass` to the server record in the UI. The factory automatically uses RCON. No other changes required.

---

## File I/O Service

All reads/writes to game save files go through `FileIOService`. It is the only piece that touches the file system — everything else goes through it.

Key behaviors:
- Returns sensible empty defaults on first boot (save dir doesn't exist yet)
- `ensureDir()` called before every write
- `serversettings.json` hot-reloads in the game — no restart needed

```typescript
// src/services/file-io.ts (abbreviated)

export class FileIOService {
  constructor(private savePath: string) {}

  async readSettings(): Promise<Record<string, unknown>> {
    try { return JSON.parse(await fs.readFile(path.join(this.savePath, 'serversettings.json'), 'utf-8')); }
    catch { return {}; }  // first boot — file doesn't exist yet
  }

  async writeSettings(data: Record<string, unknown>): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(path.join(this.savePath, 'serversettings.json'), JSON.stringify(data, null, 2), 'utf-8');
    // No restart needed — game hot-reloads this file
  }

  async readList(filename: 'banlist.txt' | 'whitelist.txt' | 'adminlist.txt'): Promise<string[]> {
    try {
      return (await fs.readFile(path.join(this.savePath, filename), 'utf-8'))
        .split('\n').map(l => l.trim()).filter(Boolean);
    } catch { return []; }
  }

  async writeList(filename: 'banlist.txt' | 'whitelist.txt' | 'adminlist.txt', lines: string[]): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(path.join(this.savePath, filename), lines.join('\n') + '\n', 'utf-8');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.savePath, { recursive: true });
  }
}
```

---

## Live Log Streaming

Game output is captured by the dashboard by streaming Docker container logs (not by tailing `log.txt`). This gives real-time output including command echoes.

```
ormod-game stdout/stderr
        │
        ↓  GET /containers/ormod-game/logs?follow=true
docker-manager.ts
        │  parse 8-byte framed chunks → clean text lines
        │  strip ANSI escape sequences
        ↓
outputBuffer (ring buffer, 1000 lines per server)
 +  EventEmitter (one per server)
        │
        ├──→ WebSocket clients (subscribe on connect, replay buffer on join)
        └──→ HTTP GET /api/servers/:id/console/log (returns last N lines)
```

Client-side hook:
```typescript
// src/hooks/useLiveLog.ts
function useLiveLog(serverId: string | undefined) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!serverId) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/log/${serverId}`);
    ws.onmessage = (e) => {
      const { line } = JSON.parse(e.data);
      setLines(prev => [...prev.slice(-500), line]);
    };
    return () => ws.close();
  }, [serverId]);

  return lines;
}
```

---

## Wipe Service

Wipes are the most critical and dangerous operation. Always: stop → backup → delete → restart.

```typescript
// Files deleted for each wipe type:
const WIPE_TARGETS = {
  MAP_ONLY:    ['ChunkData', 'RegionData', 'mapdata.json', 'entitydata.json',
                'networkentities.json', 'buildareas.json', 'structuredata.dat',
                'partialchunkdata.dat', 'pathfindingdata.dat', 'spawnregion.dat',
                'loottables.json', 'weatherdata.dat', 'worldregrowth.json'],
  MAP_PLAYERS: [ /* MAP_ONLY + */ 'PlayerData'],
  FULL:        [ /* MAP_PLAYERS + */ 'log.txt'],
  CUSTOM:      [], // populated from config.customFiles
};

// Backup uses fs.cp (cross-platform, works without tar):
await fs.cp(savePath, backupDest, { recursive: true });
```

---

## Shared Access Lists

Lists live in the database and sync to disk files per server on demand:

```
AccessList (DB)              Server A                Server B
───────────────              ────────────────────    ────────────────────
Global Ban List  ──sync──→   /saves/A/banlist.txt    /saves/B/banlist.txt
VIP Whitelist    ──sync──→   /saves/A/whitelist.txt  (not linked to B)
Admin List       ──sync──→   /saves/A/adminlist.txt  /saves/B/adminlist.txt
```

Three scopes:
- **GLOBAL** — auto-synced to every server
- **SERVER** — synced only to explicitly linked servers
- **EXTERNAL** — URL feed of SteamID64s, refreshed on demand, merged into server files on sync

---

## Database Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  role         UserRole  @default(VIEWER)
  createdAt    DateTime  @default(now())
  sessions     Session[]
}

enum UserRole { OWNER  ADMIN  VIEWER }

model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
}

model Server {
  id             String   @id @default(cuid())
  name           String                           // Display name in UI
  serverName     String   @unique                // Matches -servername flag
  savePath       String                           // Path inside dashboard container
  executablePath String   @default("")           // For future non-Docker use; unused in Docker mode
  gamePort       Int      @default(27015)
  queryPort      Int      @default(27016)
  rconPort       Int?                             // null until game adds RCON
  rconPass       String?
  notes          String?
  createdAt      DateTime @default(now())

  players     PlayerRecord[]
  wipeLogs    WipeLog[]
  schedules   ScheduledTask[]
  listLinks   ServerListLink[]
}

model PlayerRecord {
  id        String   @id @default(cuid())
  steamId   String
  serverId  String
  server    Server   @relation(fields: [serverId], references: [id])
  lastSeen  DateTime @default(now())
  totalTime Int      @default(0)
  notes     String?
  @@unique([steamId, serverId])
}

model AccessList {
  id          String         @id @default(cuid())
  name        String
  type        AccessListType
  scope       ListScope      @default(SERVER)
  description String?
  externalUrl String?                            // for EXTERNAL scope
  syncedAt    DateTime?                          // last successful refresh
  createdAt   DateTime       @default(now())

  entries     ListEntry[]
  serverLinks ServerListLink[]
}

enum AccessListType { BAN  WHITELIST  ADMIN }
enum ListScope      { GLOBAL  SERVER  EXTERNAL }

model ListEntry {
  id         String     @id @default(cuid())
  steamId    String
  playerName String?
  reason     String?
  addedBy    String?
  permission String?                            // admin lists: server/admin/operator
  expiresAt  DateTime?
  createdAt  DateTime   @default(now())
  listId     String
  list       AccessList @relation(fields: [listId], references: [id], onDelete: Cascade)
  @@unique([steamId, listId])
}

model ServerListLink {
  serverId String
  listId   String
  server   Server     @relation(fields: [serverId], references: [id])
  list     AccessList @relation(fields: [listId], references: [id])
  @@id([serverId, listId])
}

model WipeLog {
  id          String   @id @default(cuid())
  serverId    String
  server      Server   @relation(fields: [serverId], references: [id])
  wipeType    WipeType
  triggeredBy String
  notes       String?
  backupPath  String?
  success     Boolean
  errorMsg    String?
  createdAt   DateTime @default(now())
}

enum WipeType { FULL  MAP_ONLY  MAP_PLAYERS  CUSTOM }

model ScheduledTask {
  id       String   @id @default(cuid())
  serverId String
  server   Server   @relation(fields: [serverId], references: [id])
  type     TaskType
  cronExpr String
  label    String
  payload  String                               // JSON
  enabled  Boolean  @default(true)
  lastRun  DateTime?
  nextRun  DateTime?
  createdAt DateTime @default(now())
}

enum TaskType { WIPE  COMMAND  ANNOUNCEMENT  RESTART }
```

---

## Project Structure

```
ormod-rcon/
├── apps/
│   ├── api/                          # Fastify backend
│   │   ├── src/
│   │   │   ├── server.ts             # Entry point — registers plugins, routes, static serving
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── websocket.ts
│   │   │   │   └── cors.ts
│   │   │   ├── routes/
│   │   │   │   ├── servers.ts        # CRUD + start/stop/restart
│   │   │   │   ├── players.ts
│   │   │   │   ├── settings.ts       # serversettings.json R/W
│   │   │   │   ├── access-lists.ts   # ban/whitelist/admin lists
│   │   │   │   ├── console.ts        # Command dispatch + WS log stream
│   │   │   │   ├── wipe.ts
│   │   │   │   └── schedule.ts
│   │   │   ├── services/
│   │   │   │   ├── server-manager.ts # TODO: replace with docker-manager.ts
│   │   │   │   ├── file-io.ts
│   │   │   │   ├── rcon-adapter.ts
│   │   │   │   ├── wipe-service.ts
│   │   │   │   └── list-service.ts
│   │   │   └── db/
│   │   │       └── prisma-client.ts
│   │   └── prisma/
│   │       └── schema.prisma
│   └── web/                          # React frontend
│       ├── src/
│       │   ├── context/
│       │   │   └── ServerContext.tsx  # Active server state, fetches /api/servers
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── AppShell.tsx
│       │   │   │   ├── ServerSwitcher.tsx
│       │   │   │   └── NavTabs.tsx
│       │   │   └── ui/
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Players.tsx
│       │   │   ├── Settings.tsx
│       │   │   ├── Console.tsx
│       │   │   ├── AccessControl.tsx
│       │   │   ├── WipeManager.tsx
│       │   │   ├── Schedules.tsx
│       │   │   └── ServerManagement.tsx
│       │   ├── hooks/
│       │   │   ├── useServer.ts       # Re-exports from ServerContext
│       │   │   ├── useLiveLog.ts      # WebSocket log subscription
│       │   │   └── useSettings.ts     # Fetches serversettings.json
│       │   └── api/
│       │       └── client.ts          # Typed fetch wrapper
│       └── vite.config.ts
├── docker/
│   ├── Dockerfile.dashboard           # Multi-stage: web build → api build → runtime
│   ├── Dockerfile.gameserver          # Game binary container
│   ├── entrypoint-gameserver.sh
│   └── game-binary/                   # Place Linux game server files here before build
├── docs/
│   ├── ORMOD_RCON_ARCHITECTURE.md     # ← this file
│   ├── UI_DESIGN_SYSTEM.md
│   └── ormod-rcon.jsx                 # UI prototype / visual reference
├── docker-compose.yml
└── .env.example
```

---

## API Routes

### Servers
```
GET    /api/servers                          List all managed servers + running status
POST   /api/servers                          Register a new server
GET    /api/servers/:id                      Get server detail
PUT    /api/servers/:id                      Update server config
DELETE /api/servers/:id                      Remove server
POST   /api/servers/:id/start                Start game container
POST   /api/servers/:id/stop                 Stop game container
POST   /api/servers/:id/restart              Restart game container
```

### Settings
```
GET    /api/servers/:id/settings             Read serversettings.json
PUT    /api/servers/:id/settings             Write serversettings.json (hot-reloads)
PUT    /api/servers/:id/settings/:key        Write single key
```

### Players
```
GET    /api/servers/:id/players              Players from PlayerData/ files
GET    /api/players/:steamId                 Player history across all servers
```

### Console
```
POST   /api/servers/:id/console/command      Dispatch command (docker exec or future RCON)
GET    /api/servers/:id/console/log          Last N lines from output buffer
WS     /ws/log/:serverId                     Stream live output lines
```

### Access Lists
```
GET    /api/lists                            All access lists
POST   /api/lists                            Create list
GET    /api/lists/:id                        Get list + entries
PUT    /api/lists/:id                        Update list metadata
DELETE /api/lists/:id                        Delete list (cascades entries)

POST   /api/lists/:id/entries                Add/upsert entry
DELETE /api/lists/:id/entries/:steamId       Remove entry
POST   /api/lists/:id/sync/:serverId         Push list to server .txt file
POST   /api/lists/sync-all                   Push all assigned lists to all servers
POST   /api/lists/:id/refresh                Fetch externalUrl, import SteamID64s

GET    /api/servers/:id/list-assignments     Lists assigned to server
PUT    /api/servers/:id/list-assignments     Atomically replace all assignments
```

### Wipe
```
GET    /api/servers/:id/wipes                Wipe history
POST   /api/servers/:id/wipe                 Execute wipe (timeout: 300s)
GET    /api/servers/:id/wipes/:wipeId        Wipe log detail
```

### Schedules
```
GET    /api/servers/:id/schedules            List scheduled tasks
POST   /api/servers/:id/schedules            Create + register cron job
PUT    /api/servers/:id/schedules/:taskId    Update + re-register
DELETE /api/servers/:id/schedules/:taskId    Stop cron + delete
POST   /api/servers/:id/schedules/:taskId/run  Trigger immediately
```

---

## Frontend Architecture

### ServerContext

The `ServerContext` (`apps/web/src/context/ServerContext.tsx`) is the central piece of the frontend. It fetches all servers on mount and tracks which server is currently active in the top-bar switcher.

```typescript
// All pages and hooks consume this:
const { servers, activeServer, setActiveServerId, refresh } = useServer();
// activeServer: { id, name, serverName, savePath, gamePort, queryPort, running, ... }
```

The `useServer()` hook is a re-export from `ServerContext.tsx` via `hooks/useServer.ts` to keep import paths stable.

### Data flow
```
ServerContext (fetches /api/servers on mount)
    ↓ activeServer.id
Page components → api.get/post('/api/servers/${id}/...') → Fastify routes
                                                              ↓
                                                       Prisma (DB)
                                                       FileIOService (save files)
                                                       DockerManager (process mgmt)
```

---

## Security Notes

- The dashboard should **never** be exposed to the public internet without a reverse proxy (nginx/Caddy) and HTTPS
- The Docker socket mount (`/var/run/docker.sock`) grants root-equivalent access — do not expose it beyond the dashboard container
- The `BETTER_AUTH_SECRET` must be changed from the default before deployment (server refuses to start in production if left as the default)
- Auth (Better Auth) is fully implemented; all `/api/*` routes require a valid session. First-run `/api/setup` creates the initial OWNER account.
- Use `docker-compose.secure.yml` (recommended) to avoid mounting the raw Docker socket into the dashboard — socket proxy filters API access to container-control only.
- All wipe operations are logged to the DB with the user ID who triggered them

---

## Save Directory Layout (inside volume)

```
/saves/<ServerName>/
├── ChunkData/              # World chunk data (deleted on map wipe)
├── RegionData/             # World region data (deleted on map wipe)
├── PlayerData/             # Per-player .json files (deleted on full/player wipe)
│   └── 76561198001234567.json
├── adminlist.txt           # SteamId:PermissionLevel, one per line
├── banlist.txt             # SteamId, one per line
├── whitelist.txt           # SteamId, one per line
├── serversettings.json     # Hot-reloads in game
├── mapdata.json
├── entitydata.json
├── networkentities.json
├── buildareas.json
├── structuredata.dat
├── partialchunkdata.dat
├── pathfindingdata.dat
├── spawnregion.dat
├── loottables.json
├── weatherdata.dat
├── worldregrowth.json
└── log.txt
```

---

## Scheduled Wipe Example

```json
{
  "type": "WIPE",
  "cronExpr": "0 6 * * 1",
  "label": "Weekly Monday Map Wipe",
  "payload": {
    "wipeType": "MAP_ONLY",
    "keepPlayerData": true,
    "keepAccessLists": true,
    "createBackup": true,
    "serverWillRestart": true,
    "notes": "Auto weekly wipe"
  }
}
```

cron-parser API (v4/v5): `CronExpressionParser.parse(cronExpr).next().toDate()`

---

## Future Roadmap

### SteamCMD (when game publishes on Steam)
Replace `COPY docker/game-binary/` in `Dockerfile.gameserver` with:
```dockerfile
FROM cm2network/steamcmd:latest
RUN /home/steam/steamcmd/steamcmd.sh \
    +force_install_dir /home/steam/ormod \
    +login anonymous \
    +app_update <STEAM_APP_ID> validate \
    +quit
```
Everything else stays the same.

### RCON (when game adds WebSocket RCON)
1. `rconPort` and `rconPass` are already in the schema
2. Implement `WebSocketRconAdapter.connect()` and `sendCommand()` using `net.Socket` (TCP binary)
3. The `getAdapter()` factory automatically switches when credentials are present
4. Live player list, real ping values, and bidirectional console become possible
5. No route or UI changes required

### Auth
Better Auth is already installed. Add a `preHandler` hook to each Fastify route plugin to validate the session token before allowing access.
