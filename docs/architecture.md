# ORMOD: Directive — Community RCON Dashboard

## Architecture & Implementation Guide

---

## Overview

**ormod-rcon** is a self-hosted, open-source server management dashboard for ORMOD: Directive dedicated servers. The goal is a community tool comparable to what RustAdmin or RCON Web Admin provides for Rust, purpose-built for ORMOD with first-class support for the game's file-based config system, multi-server management, and future WebSocket RCON when the game adds it.

---

## Tech Stack

| Layer            | Choice                                  | Why                                                                             |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| Frontend         | React 19 + TypeScript + Vite 7          | Fast DX, strong typing, great ecosystem                                         |
| Styling          | Tailwind CSS v4                         | Design system layer (reset + token variables); named CSS classes in `index.css` |
| API              | Node.js + Fastify 5 + TypeScript        | Lightweight, schema validation, fast                                            |
| Database         | SQLite via Prisma 7 ORM                 | Zero-setup, file-based, perfect for a self-hosted tool                          |
| Realtime         | WebSocket (ws + @fastify/websocket)     | Stream server output and player events live to the UI                           |
| Auth             | Better Auth (session-based)             | Simple, self-hosted, email+password, no external service needed                 |
| Process mgmt     | Docker HTTP API (native Node.js `http`) | Controls game container via PTY attach; no external packages                    |
| Scheduling       | node-cron                               | Scheduled wipes, announcements, restarts                                        |
| Containerisation | Docker + Docker Compose                 | Single `docker compose up` to run everything                                    |
| Config           | dotenv / env vars                       | Secrets stay out of code                                                        |

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
         ↑ stdin via docker attach                              ↑
         └──────────────────────────────────────────────────┘
                         /var/run/docker.sock
```

### Why Docker socket instead of a sidecar agent?

The Docker Engine exposes a full HTTP API over a Unix socket at `/var/run/docker.sock`. Mounting the socket in the dashboard container gives it the ability to:

- Start, stop, and restart the game container
- Stream the game's stdout/stderr via `GET /containers/{name}/logs?follow=true`
- Execute commands in the game container via `POST /containers/{name}/attach` (HTTP Upgrade to raw PTY)

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
import http from 'http'

function dockerRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: '/var/run/docker.sock',
        method,
        path,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve(data ? JSON.parse(data) : {}))
      }
    )
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// Start: POST /containers/ormod-game/start
await dockerRequest('POST', `/containers/${containerName}/start`)

// Stop: POST /containers/ormod-game/stop
await dockerRequest('POST', `/containers/${containerName}/stop`)

// Restart: POST /containers/ormod-game/restart
await dockerRequest('POST', `/containers/${containerName}/restart`)
```

### Streaming game output (log lines)

Docker streams logs in two different framing modes depending on whether the container has a TTY allocated:

**TTY mode (`tty: true` — default for our game container):**

```typescript
// GET /containers/ormod-game/logs?follow=true&stdout=true&stderr=true
// Docker streams raw PTY bytes with \r\n line endings
// No frame headers — just plain text with ANSI escape sequences

let lineBuffer = ''
res.on('data', (chunk: Buffer) => {
  lineBuffer += stripAnsi(chunk.toString('utf-8'))
  const lines = lineBuffer.split(/\r?\n/)
  lineBuffer = lines.pop() ?? '' // last may be incomplete
  for (const line of lines) {
    pushLine(line.trimEnd())
  }
})
```

**Non-TTY mode (`tty: false` — if ever needed):**

```typescript
// GET /containers/ormod-game/logs?follow=true&stdout=true&stderr=true
// Docker multiplexes stdout/stderr into 8-byte framed chunks
// Frame header: [stream_type(1), 0, 0, 0, size(4 bytes big-endian)]

let frameBuffer = Buffer.alloc(0)
res.on('data', (chunk: Buffer) => {
  frameBuffer = Buffer.concat([frameBuffer, chunk])
  while (frameBuffer.length >= 8) {
    const frameSize = frameBuffer.readUInt32BE(4)
    if (frameBuffer.length < 8 + frameSize) break
    const line = frameBuffer
      .subarray(8, 8 + frameSize)
      .toString('utf-8')
      .trimEnd()
    if (line) pushLine(line)
    frameBuffer = frameBuffer.subarray(8 + frameSize)
  }
})
```

### Sending commands to game stdin (docker attach)

```typescript
// Docker attach with HTTP Upgrade gives direct PTY master socket access.
// Writing cmd\n to the socket is identical to the user typing in `docker attach`.

const req = http.request({
  socketPath: '/var/run/docker.sock',
  method: 'POST',
  path: `/containers/${containerName}/attach?stdin=1&stream=1&stdout=0&stderr=0`,
  headers: {
    'Content-Type': 'application/vnd.docker.raw-stream',
    Connection: 'Upgrade',
    Upgrade: 'tcp',
  },
})

// 101 Switching Protocols → socket is now the raw PTY master connection
req.on('upgrade', (_res, socket) => {
  socket.write(`${cmd}\n`, (err) => {
    socket.end()
    if (err) reject(err)
    else resolve()
  })
})

req.on('response', (res) => {
  // Non-101 response means the container isn't running or attach failed
  reject(new Error(`Docker attach ${res.statusCode}`))
})

req.end()
```

---

## RCON Abstraction Layer

The game currently only supports commands via Docker attach. RCON WebSocket is coming. The `rcon-adapter.ts` service abstracts over both so routes never change:

```typescript
// src/services/rcon-adapter.ts

export interface RconAdapter {
  sendCommand(cmd: string): Promise<string>
  isConnected(): boolean
}

// Current: Docker attach to PTY master
export class DockerExecAdapter implements RconAdapter {
  constructor(private serverId: string) {}

  async sendCommand(cmd: string): Promise<string> {
    const { dockerManager } = await import('./docker-manager.js')
    await dockerManager.sendCommand(this.serverId, cmd)
    return 'Command dispatched via docker attach'
  }

  isConnected(): boolean {
    return true // connected as long as the container exists
  }
}

// Future: WebSocket RCON (implement when game adds it)
export class WebSocketRconAdapter implements RconAdapter {
  private ws: WebSocket | null = null

  async connect(host: string, port: number, pass: string): Promise<void> {
    // Similar to Facepunch webrcon protocol
    throw new Error('RCON not yet implemented by game')
  }

  async sendCommand(cmd: string): Promise<string> {
    // Send JSON packet, await response
    throw new Error('RCON not yet implemented by game')
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Factory: routes always call getAdapter(), never the adapter directly
export async function getAdapter(server: {
  id: string
  rconPort?: number | null
  rconPass?: string | null
}): Promise<RconAdapter> {
  if (server.rconPort && server.rconPass) {
    // Future: instantiate WebSocketRconAdapter and connect
    throw new Error('RCON WebSocket not yet implemented by game')
  }
  return new DockerExecAdapter(server.id)
}
```

**Container name resolution:** `getAdapter()` resolves the container name in this order:

1. `server.containerName` (explicit per-server setting)
2. `server.executablePath` (legacy fallback for backward compatibility)
3. `GAME_CONTAINER_NAME` environment variable (default: `'ormod-game'`)

**Migration path:** When RCON lands, add `rconPort` + `rconPass` to the server record. The factory automatically uses RCON. No other changes required.

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
    try {
      return JSON.parse(await fs.readFile(path.join(this.savePath, 'serversettings.json'), 'utf-8'))
    } catch {
      return {}
    } // first boot — file doesn't exist yet
  }

  async writeSettings(data: Record<string, unknown>): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      path.join(this.savePath, 'serversettings.json'),
      JSON.stringify(data, null, 2),
      'utf-8'
    )
    // No restart needed — game hot-reloads this file
  }

  async readList(filename: 'banlist.txt' | 'whitelist.txt' | 'adminlist.txt'): Promise<string[]> {
    try {
      return (await fs.readFile(path.join(this.savePath, filename), 'utf-8'))
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async writeList(
    filename: 'banlist.txt' | 'whitelist.txt' | 'adminlist.txt',
    lines: string[]
  ): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(path.join(this.savePath, filename), lines.join('\n') + '\n', 'utf-8')
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.savePath, { recursive: true })
  }
}
```

---

## Live Log Streaming

Game output is captured by the dashboard by streaming Docker container logs. The output flows through a ring buffer and event emitter per-server, allowing both HTTP and WebSocket subscribers.

```
ormod-game stdout/stderr
        │
        ↓  GET /containers/ormod-game/logs?follow=true
docker-manager.ts (startLogStream)
        │  parse TTY/multiplex frames → clean text lines
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
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    if (!serverId) return
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/log/${serverId}`
    )
    ws.onmessage = (e) => {
      const { line } = JSON.parse(e.data)
      setLines((prev) => [...prev.slice(-500), line])
    }
    return () => ws.close()
  }, [serverId])

  return lines
}
```

---

## Wipe Service

Wipes are the most critical and dangerous operation. Always: stop → backup → delete → restart.

```typescript
// Files deleted for each wipe type:
const WIPE_TARGETS = {
  MAP_ONLY: [
    'ChunkData',
    'RegionData',
    'mapdata.json',
    'entitydata.json',
    'networkentities.json',
    'buildareas.json',
    'structuredata.dat',
    'partialchunkdata.dat',
    'pathfindingdata.dat',
    'spawnregion.dat',
    'loottables.json',
    'weatherdata.dat',
    'worldregrowth.json',
  ],
  MAP_PLAYERS: [/* MAP_ONLY + */ 'PlayerData'],
  FULL: [/* MAP_PLAYERS + */ 'log.txt'],
  CUSTOM: [], // populated from config.customFiles
}

// Backup uses fs.cp (cross-platform, works without tar):
await fs.cp(savePath, backupDest, { recursive: true })
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
  provider = "prisma-client"
  output   = "./generated"
}

datasource db {
  provider = "sqlite"
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth — BetterAuth schema (email + password, sessions, OAuth-ready)
// Roles: OWNER | ADMIN | VIEWER
// ─────────────────────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          String    @default("VIEWER")  // OWNER | ADMIN | VIEWER
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions  Session[]
  accounts  Account[]
}

// BetterAuth session — token stored in HTTP-only cookie
model Session {
  id        String   @id @default(cuid())
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime  @updatedAt
  ipAddress String?
  userAgent String?

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// BetterAuth account — holds credentials per provider (password stored here)
model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

// BetterAuth verification tokens (email verification, password reset)
model Verification {
  id         String    @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime? @default(now())
  updatedAt  DateTime?
}

// ─────────────────────────────────────────────────────────────────────────────
// Game servers
// ─────────────────────────────────────────────────────────────────────────────

model Server {
  id             String   @id @default(cuid())
  name           String                          // Display name in UI
  serverName     String   @unique               // Matches -servername flag
  savePath       String                          // Abs path inside dashboard container
  containerName  String?                         // Docker container name (null = env default)
  executablePath String   @default("")          // Legacy — kept for DB compat; prefer containerName
  mode           String   @default("DOCKER")    // DOCKER | RCON (RCON reserved for future)
  gamePort       Int      @default(27015)
  queryPort      Int      @default(27016)
  rconPort       Int?                            // null until the game ships RCON
  rconPass       String?
  notes          String?
  createdAt      DateTime @default(now())

  players     PlayerRecord[]
  wipeLogs    WipeLog[]
  schedules   ScheduledTask[]
  listLinks   ServerListLink[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Player records (populated from PlayerData/ files)
// ─────────────────────────────────────────────────────────────────────────────

model PlayerRecord {
  id        String   @id @default(cuid())
  steamId   String
  serverId  String
  server    Server   @relation(fields: [serverId], references: [id])
  lastSeen  DateTime @default(now())
  totalTime Int      @default(0)  // seconds
  notes     String?

  @@unique([steamId, serverId])
}

// ─────────────────────────────────────────────────────────────────────────────
// Access lists (shareable across servers)
// ─────────────────────────────────────────────────────────────────────────────

model AccessList {
  id          String   @id @default(cuid())
  name        String                               // e.g. "Global Ban List"
  type        String                               // BAN | WHITELIST | ADMIN
  scope       String   @default("SERVER")         // GLOBAL | SERVER | EXTERNAL
  description String?
  externalUrl String?                              // EXTERNAL scope: URL to fetch list from
  syncedAt    DateTime?                            // Last external sync timestamp
  createdAt   DateTime @default(now())

  entries     ListEntry[]
  serverLinks ServerListLink[]
}

model ListEntry {
  id         String    @id @default(cuid())
  steamId    String
  playerName String?                        // cached display name
  reason     String?
  addedBy    String?
  permission String?                        // for admin lists: server/admin/operator/client
  expiresAt  DateTime?
  createdAt  DateTime  @default(now())

  listId     String
  list       AccessList @relation(fields: [listId], references: [id], onDelete: Cascade)

  @@unique([steamId, listId])
}

// Link a server to one or more access lists
model ServerListLink {
  serverId String
  listId   String
  server   Server     @relation(fields: [serverId], references: [id])
  list     AccessList @relation(fields: [listId], references: [id])

  @@id([serverId, listId])
}

// ─────────────────────────────────────────────────────────────────────────────
// Wipe history
// ─────────────────────────────────────────────────────────────────────────────

model WipeLog {
  id          String   @id @default(cuid())
  serverId    String
  server      Server   @relation(fields: [serverId], references: [id])
  wipeType    String                        // FULL | MAP_ONLY | MAP_PLAYERS | CUSTOM
  triggeredBy String                        // dashboard user id
  notes       String?
  backupPath  String?                       // path to pre-wipe backup
  success     Boolean
  errorMsg    String?
  createdAt   DateTime @default(now())
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled tasks
// ─────────────────────────────────────────────────────────────────────────────

model ScheduledTask {
  id        String    @id @default(cuid())
  serverId  String
  server    Server    @relation(fields: [serverId], references: [id])
  type      String                          // WIPE | COMMAND | ANNOUNCEMENT | RESTART
  cronExpr  String                          // e.g. "0 6 * * 1" = every Monday 6am
  label     String
  payload   String                          // JSON - command string, wipe config, etc.
  enabled   Boolean   @default(true)
  lastRun   DateTime?
  nextRun   DateTime?
  createdAt DateTime  @default(now())
}
```

---

## Project Structure

```
ormod-rcon/
├── apps/
│   ├── api/                            # Fastify backend
│   │   ├── src/
│   │   │   ├── app.ts                  # Fastify factory (builds app instance, testable)
│   │   │   ├── server.ts               # Thin entry point (listen, TLS, post-startup tasks)
│   │   │   ├── config.ts               # Env schema + Fastify type augmentation
│   │   │   ├── types.ts                # Shared TypeScript string-literal types
│   │   │   ├── plugins/                # Autoloaded (ordered by fp dependency graph)
│   │   │   │   ├── 01-sensible.ts      # @fastify/sensible (httpErrors, reply helpers)
│   │   │   │   ├── 02-env.ts           # @fastify/env (schema validation + dotenv)
│   │   │   │   ├── 03-database.ts      # Prisma lifecycle (decorate, onClose)
│   │   │   │   ├── 04-formbody.ts      # @fastify/formbody
│   │   │   │   ├── 05-cookie.ts        # @fastify/cookie
│   │   │   │   ├── 06-helmet.ts        # @fastify/helmet (HSTS, referrer, frameguard)
│   │   │   │   ├── 07-cors.ts          # @fastify/cors (reads fastify.config)
│   │   │   │   ├── 08-csrf.ts          # @fastify/csrf-protection (cookie double-submit)
│   │   │   │   ├── 09-underpressure.ts # @fastify/under-pressure (backpressure)
│   │   │   │   └── 10-auth.ts          # BetterAuth hooks + auth guard preHandlers
│   │   │   ├── routes/                 # Autoloaded under /api prefix
│   │   │   │   ├── setup.ts            # GET + POST /api/setup (first-run)
│   │   │   │   ├── capabilities.ts     # GET /api/capabilities
│   │   │   │   ├── csrf.ts             # GET /api/csrf-token
│   │   │   │   ├── users.ts            # User management (OWNER only)
│   │   │   │   ├── servers.ts          # CRUD + start/stop/restart
│   │   │   │   ├── players.ts          # Player records and history
│   │   │   │   ├── settings.ts         # serversettings.json R/W
│   │   │   │   ├── access-lists.ts     # ban/whitelist/admin lists
│   │   │   │   ├── console.ts          # Command dispatch + HTTP log
│   │   │   │   ├── wipe.ts             # Wipe execution and history
│   │   │   │   └── schedule.ts         # Cron task management
│   │   │   ├── controllers/            # Handler logic (one file per route domain)
│   │   │   │   ├── setup.ts
│   │   │   │   ├── capabilities.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── servers.ts
│   │   │   │   ├── players.ts
│   │   │   │   ├── settings.ts
│   │   │   │   ├── access-lists.ts
│   │   │   │   ├── console.ts
│   │   │   │   ├── wipe.ts
│   │   │   │   └── schedule.ts
│   │   │   ├── services/               # Business logic
│   │   │   │   ├── docker-manager.ts   # Docker socket API, log streaming, command dispatch
│   │   │   │   ├── rcon-adapter.ts     # Abstraction layer (Docker now, RCON future)
│   │   │   │   ├── file-io.ts          # Save directory reads/writes
│   │   │   │   ├── wipe-service.ts     # Wipe logic
│   │   │   │   └── list-service.ts     # Access list sync logic
│   │   │   ├── lib/
│   │   │   │   └── auth.ts             # BetterAuth instance + role helpers
│   │   │   └── db/
│   │   │       └── prisma-client.ts    # Singleton Prisma client
│   │   ├── prisma/
│   │   │   ├── schema.prisma           # Database schema
│   │   │   └── generated/              # Prisma client (generated, gitignored)
│   │   ├── prisma.config.ts            # Prisma driver adapter config
│   │   └── package.json
│   │
│   └── web/                            # React frontend
│       ├── src/
│       │   ├── App.tsx                 # Router (BrowserRouter → AuthProvider → ServerProvider)
│       │   ├── index.css               # Tailwind @import + named CSS classes
│       │   ├── lib/
│       │   │   ├── auth-client.ts      # BetterAuth client
│       │   │   └── constants.ts        # SERVER_SETTING_GROUPS, GAME_COMMANDS
│       │   ├── context/
│       │   │   ├── AuthContext.tsx     # Auth state + session validation
│       │   │   └── ServerContext.tsx   # Active server state (fetches /api/servers)
│       │   ├── api/
│       │   │   └── client.ts           # Typed fetch wrapper
│       │   ├── hooks/
│       │   │   ├── useServer.ts        # Re-exports useServerContext
│       │   │   ├── useLiveLog.ts       # WebSocket log subscription
│       │   │   └── useSettings.ts      # Fetches serversettings.json
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── AppShell.tsx    # Authenticated layout (nav, server switcher)
│       │   │   │   ├── ServerSwitcher.tsx
│       │   │   │   └── NavTabs.tsx
│       │   │   └── ui/                 # Shared UI components
│       │   │       ├── Button.tsx
│       │   │       ├── Modal.tsx
│       │   │       ├── ConfirmDialog.tsx
│       │   │       ├── EmptyState.tsx
│       │   │       ├── PageHeader.tsx
│       │   │       ├── ChangePasswordModal.tsx
│       │   │       └── ... (other shared components)
│       │   └── pages/                  # Full-page components
│       │       ├── Login.tsx            # Email + password login
│       │       ├── Setup.tsx            # First-run setup (create OWNER account)
│       │       ├── Dashboard.tsx        # Server stats, live log, players
│       │       ├── Players.tsx          # Player list with per-player actions
│       │       ├── Settings.tsx         # serversettings.json editor
│       │       ├── Console.tsx          # Terminal with command palette
│       │       ├── AccessControl.tsx    # Ban/whitelist/admin lists
│       │       ├── WipeManager.tsx      # Wipe presets, history, scheduler
│       │       ├── Schedules.tsx        # Cron task editor
│       │       ├── ServerManagement.tsx # Add/edit/delete servers
│       │       └── UserManagement.tsx   # User CRUD (OWNER only)
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── Dockerfile.dashboard           # Multi-stage: web build → api build → runtime
│   ├── Dockerfile.gameserver          # Game binary container
│   ├── entrypoint-gameserver.sh
│   └── game-binary/                   # (Optional) place Linux game binary here
│
├── docs/
│   ├── architecture.md                # ← this file
│   ├── UI_DESIGN_SYSTEM.md            # Design system & component rules
│   ├── ormod-rcon.jsx                 # UI prototype / visual reference
│   ├── lessons.md                     # Captured design patterns
│   └── todo.md                        # Task tracking
│
├── docker-compose.yml
├── docker-compose.secure.yml          # (Optional) socket proxy for extra isolation
├── .env.example
└── README.md
```

---

## API Routes

### Health / Setup

```
GET    /health                           Health check (no auth required)
GET    /api/setup                        Check if setup is needed (no auth required)
POST   /api/setup                        Create initial OWNER account (no auth required)
```

### Capabilities

```
GET    /api/capabilities                 List backend capabilities (auth required)
```

### CSRF Protection

```
GET    /api/csrf-token                   Get CSRF token for unsafe methods
```

### Users

```
GET    /api/users                        List all users (OWNER only)
POST   /api/users                        Create user (OWNER only)
PUT    /api/users/:id/role               Change user role (OWNER only)
DELETE /api/users/:id                    Delete user (OWNER only)
GET    /api/me                           Get current user profile (any auth)
POST   /api/auth/change-password         Change own password (any auth)
```

### Servers

```
GET    /api/servers                      List all managed servers + running status
POST   /api/servers                      Register a new server (OWNER only)
GET    /api/servers/:id                  Get server detail
PUT    /api/servers/:id                  Update server config (ADMIN+)
DELETE /api/servers/:id                  Remove server (OWNER only)
POST   /api/servers/:id/start            Start game container (ADMIN+)
POST   /api/servers/:id/stop             Stop game container (ADMIN+)
POST   /api/servers/:id/restart          Restart game container (ADMIN+)
```

### Settings

```
GET    /api/servers/:id/settings         Read serversettings.json
PUT    /api/servers/:id/settings         Write serversettings.json (hot-reloads)
PUT    /api/servers/:id/settings/:key    Write single key
```

### Players

```
GET    /api/servers/:id/players          Players from PlayerData/ files
GET    /api/players/:steamId             Player history across all servers
```

### Console

```
POST   /api/servers/:id/console/command  Dispatch command (docker attach or future RCON)
GET    /api/servers/:id/console/log      Last N lines from output buffer
WS     /ws/log/:serverId                 Stream live output lines
```

### Access Lists

```
GET    /api/lists                        All access lists
POST   /api/lists                        Create list (ADMIN+)
GET    /api/lists/:id                    Get list + entries
PUT    /api/lists/:id                    Update list metadata (ADMIN+)
DELETE /api/lists/:id                    Delete list (cascades entries) (ADMIN+)

POST   /api/lists/:id/entries            Add/upsert entry (ADMIN+)
DELETE /api/lists/:id/entries/:steamId   Remove entry (ADMIN+)
POST   /api/lists/:id/sync/:serverId     Push list to server .txt file (ADMIN+)
POST   /api/lists/sync-all               Push all assigned lists to all servers (ADMIN+)
POST   /api/lists/:id/refresh            Fetch externalUrl, import SteamID64s (ADMIN+)

GET    /api/servers/:id/list-assignments Lists assigned to server
PUT    /api/servers/:id/list-assignments Atomically replace all assignments (ADMIN+)
```

### Wipe

```
GET    /api/servers/:id/wipes            Wipe history
POST   /api/servers/:id/wipe             Execute wipe (timeout: 300s) (ADMIN+)
GET    /api/servers/:id/wipes/:wipeId    Wipe log detail
```

### Schedules

```
GET    /api/servers/:id/schedules        List scheduled tasks
POST   /api/servers/:id/schedules        Create + register cron job (ADMIN+)
PUT    /api/servers/:id/schedules/:taskId Update + re-register (ADMIN+)
DELETE /api/servers/:id/schedules/:taskId Stop cron + delete (ADMIN+)
POST   /api/servers/:id/schedules/:taskId/run  Trigger immediately (ADMIN+)
```

---

## Authentication & Authorization

### Overview

Auth is **fully implemented** using BetterAuth (email+password, self-hosted).

**Session model:**

- HTTP-only cookies (set by BetterAuth)
- 7-day expiry
- 24-hour refresh on activity
- Token stored in `Session` table

**Roles:**

- `OWNER` — full control (user management, server creation, wipe)
- `ADMIN` — operational access (start/stop/restart, console, access lists)
- `VIEWER` — read-only

**First-run setup:**

- `/api/setup` creates the initial OWNER account
- Subsequent users created via `/api/users` (OWNER only)

### Session validation

**HTTP routes:**
Each route plugin has preHandler hooks that validate `req.session`:

- `requireOwner` — only OWNER
- `requireWrite` — OWNER or ADMIN
- Implicitly authenticated routes check `req.session` exists

**WebSocket routes:**
WebSocket connections perform explicit session validation on upgrade (separate from preHandler):

```typescript
ws.on('connection', async (ws, req) => {
  const session = req.headers.authorization || cookies.sessionToken
  const user = await auth.api.getSession({ headers: { cookie: `auth.js=${session}` } })
  if (!user) {
    ws.close()
    return
  }
  // authenticated — subscribe to events
})
```

### CSRF protection

Double-submit cookie pattern via `@fastify/csrf-protection`:

- GET `/api/csrf-token` returns a token in the response body
- `POST` / `PUT` / `DELETE` routes validate `X-CSRF-Token` header against the cookie
- Frontend `api.post()` client automatically fetches and retries on CSRF failure

---

## Frontend Architecture

### App Layout

```typescript
<BrowserRouter>
  <AuthProvider>          {/* Checks session on mount + route changes */}
    <ServerProvider>      {/* Fetches /api/servers on mount */}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/" element={<AppShell />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="players" element={<Players />} />
          {/* ... rest of routes */}
        </Route>
      </Routes>
    </ServerProvider>
  </AuthProvider>
</BrowserRouter>
```

### ServerContext

The `ServerContext` (`apps/web/src/context/ServerContext.tsx`) is the central piece. It fetches all servers on mount and tracks which server is currently active in the top-bar switcher.

```typescript
// All pages and hooks consume this:
const { servers, activeServer, setActiveServerId, refresh } = useServerContext()
// activeServer: { id, name, serverName, savePath, containerName, mode, gamePort, queryPort, running, notes? }
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

### AuthContext

`AuthContext.tsx` provides the current user session and session validation logic:

- Checks for active session on app mount and route changes
- Redirects unauthenticated users to `/login`
- Redirects non-OWNER users away from `/users`
- Exposes `useAuth()` hook with `user`, `logout()`, etc.

---

## CSS Architecture

Tailwind v4 is activated via `@import "tailwindcss"` at the top of `apps/web/src/index.css`.

**Do not** use Tailwind utility classes inline in JSX. All component styles live as named CSS classes in `index.css`:

```css
/* Good */
.card {
  @apply bg-slate-800 border border-slate-700 rounded p-4 shadow;
}
.btn {
  @apply px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded;
}

/* Bad — don't do this */
<div className="bg-slate-800 border border-slate-700 rounded p-4 shadow">
```

Tailwind provides:

- Preflight reset + responsive utilities via CSS variables only
- No inline utility classes in JSX

---

## Security Notes

- The dashboard should **never** be exposed to the public internet without a reverse proxy (nginx/Caddy) and HTTPS
- The Docker socket mount (`/var/run/docker.sock`) grants root-equivalent access — do not expose it beyond the dashboard container
- The `BETTER_AUTH_SECRET` must be changed from the default before deployment (server refuses to start in production if left as the default)
- Auth (Better Auth) is fully implemented; all `/api/*` routes require a valid session
- Use `docker-compose.secure.yml` (recommended) to avoid mounting the raw Docker socket into the dashboard — socket proxy filters API access to container-control only
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
