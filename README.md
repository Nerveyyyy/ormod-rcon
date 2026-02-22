# ormod-rcon — Ormod: Directive RCON Tool

Self-hosted RCON dashboard for ORMOD: Directive dedicated servers. Manage players, settings, access lists, wipes, and scheduled tasks from a single web UI.

---

## Features

- **Live console** — stream server output in real time, dispatch commands via stdin
- **Player management** — view all players, kick, ban, promote/demote with one click
- **Server settings** — live-edit `serversettings.json` (hot-reloads, no restart needed)
- **Access lists** — shared ban/whitelist/admin lists that sync across all your servers
- **Wipe manager** — map wipe, full wipe, custom file picker, pre-wipe backups, wipe history
- **Scheduled tasks** — cron-based wipes, commands, announcements, restarts
- **Multi-server** — manage multiple servers from one dashboard

---

## How it works

Two Docker containers share a volume for save files:

```
┌──────────────────────────┐   shared volume  ┌──────────────────────────────┐
│   ormod-game             │ ←── /saves ─────→ │   ormod-dashboard            │
│                          │                   │                              │
│  ORMODDirective binary   │                   │  Fastify API + React UI      │
│  Writes save files       │                   │  Reads/writes save files     │
│  Reads adminlist etc.    │                   │  Controls game via Docker API│
└──────────────────────────┘                   └──────────────────────────────┘
         ↑ stdin via docker exec                        port 3000
```

The dashboard communicates with the game container via the Docker socket — no sidecar agents, no RCON (until the game adds it).

---

## Recommended Dedi Box Layout

For a clean dedicated server setup, the recommended directory structure is:

```
/opt/ormod/          (or ~/ormod/ — wherever you want on the host)
├── server/          ← game binary files (ORMODDirective + all assets)
├── configs/         ← save data, serversettings.json, adminlist, banlist, etc.
│   └── MyServer/    ← one subdirectory per server instance
└── rcon/            ← this git repo (clone here)
    ├── data/        ← SQLite database (auto-created on first run)
    ├── backups/     ← pre-wipe backups (auto-created on first run)
    ├── docker-compose.yml
    └── .env
```

Set these two variables in `rcon/.env` to wire everything up:

```env
GAME_BINARY_PATH=../server
SAVES_PATH=../configs
```

> **Permissions:** When using `SAVES_PATH`, ensure the directory is writable by UID 1000 (the `steam` user inside the game container):
> ```bash
> chown -R 1000:1000 /opt/ormod/configs
> ```

---

## Quick Start

### Requirements

- Docker + Docker Compose (Docker Desktop on Windows/Mac, Docker Engine on Linux)
- The ORMOD: Directive Linux dedicated server binary

### 1. Set up the directory layout

```bash
# Following the recommended dedi box layout:
mkdir -p /opt/ormod/{server,configs}
cp -r /path/to/ormod-server/* /opt/ormod/server/

# Ensure the binary is executable
chmod +x /opt/ormod/server/ORMODDirective

# Ensure the configs directory is writable by the game container (UID 1000)
chown -R 1000:1000 /opt/ormod/configs

# Clone the dashboard into the rcon/ subdirectory
git clone https://github.com/Nerveyyyy/ormod-rcon /opt/ormod/rcon
cd /opt/ormod/rcon
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — at minimum set:
#   JWT_SECRET    (run: openssl rand -hex 32)
#   SERVER_NAME
#   GAME_BINARY_PATH=../server
#   SAVES_PATH=../configs
```

### 3. Start

```bash
docker compose up -d
```

The dashboard is available at `http://<server-ip>:3000` (or whatever `DASHBOARD_PORT` is set to).

---

### Alternative: Single Directory (no dedi box layout)

If you just want everything in one place without the parent directory structure:

```bash
git clone https://github.com/Nerveyyyy/ormod-rcon
cd ormod-rcon

# Place game binary in docker/game-binary/
mkdir -p docker/game-binary
cp -r /path/to/ormod-server/* docker/game-binary/
chmod +x docker/game-binary/ORMODDirective

# Configure (GAME_BINARY_PATH and SAVES_PATH can be left at defaults)
cp .env.example .env
# Edit .env — set JWT_SECRET and SERVER_NAME

docker compose up -d
```

In this mode saves are stored in a Docker-managed named volume (`game-saves`).

---

## Configuration

All settings live in `.env` (copied from `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(required)* | Random secret for sessions — run `openssl rand -hex 32` |
| `SERVER_NAME` | `MyOrmodServer` | Passed as `-servername` to the game binary |
| `GAME_PORT` | `27015` | UDP port Docker forwards from the host (actual value set in `serversettings.json`) |
| `QUERY_PORT` | `27016` | UDP query port Docker forwards from the host |
| `GAME_CONTAINER_NAME` | `ormod-game` | Docker container name for the game |
| `GAME_BINARY_PATH` | `./docker/game-binary` | Host path to the game binary directory |
| `SAVES_PATH` | *(named volume)* | Host path for save data. Leave unset for a Docker-managed named volume, or set to a host path (e.g. `../configs`) for direct access |
| `DASHBOARD_HOST` | `0.0.0.0` | Host IP the dashboard binds to. Set to a specific IP to restrict to one interface |
| `DASHBOARD_PORT` | `3000` | Host port for the dashboard |
| `DATABASE_URL` | `file:/data/ormod-rcon.db` | SQLite path inside the dashboard container |

---

## IP Binding

`DASHBOARD_HOST` controls which network interface the dashboard is exposed on:

```env
# All interfaces (default — reachable from any IP on the machine)
DASHBOARD_HOST=0.0.0.0

# LAN interface only
DASHBOARD_HOST=10.0.0.1

# Localhost only (useful behind a reverse proxy)
DASHBOARD_HOST=127.0.0.1
```

The game server ports (`GAME_PORT`, `QUERY_PORT`) are bound to all interfaces by default. To restrict them, edit the `ports:` entries in `docker-compose.yml` directly.

---

## Registering Additional Servers

Add more servers through the **Servers** page in the dashboard UI. Each server entry stores its own `savePath` and Docker container name. Access lists can be shared and synced across all registered servers simultaneously.

---

## Repo Layout

```
ormod-rcon/                       (clone here — this is the rcon/ directory)
├── apps/
│   ├── api/                      # Fastify backend (TypeScript)
│   └── web/                      # React frontend (Vite + Tailwind)
├── docker/
│   ├── Dockerfile.dashboard      # API + React static (combined container)
│   ├── Dockerfile.gameserver     # Game binary container
│   ├── entrypoint-gameserver.sh
│   └── game-binary/              # Optional: place binary here if not using GAME_BINARY_PATH
├── docs/
│   ├── ORMOD_RCON_ARCHITECTURE.md
│   └── UI_DESIGN_SYSTEM.md
├── docker-compose.yml
└── .env.example
```

---

## Future: RCON Support

When ORMOD: Directive adds WebSocket RCON, the command dispatch path will switch automatically. The `rcon-adapter.ts` service already has a `WebSocketRconAdapter` stub — fill in the `rconPort` and `rconPass` per server in the UI and commands will route through RCON instead of Docker exec. No UI changes required.

---

## Future: SteamCMD

When the game is published on Steam, `docker/Dockerfile.gameserver` will switch from a manual binary mount to a SteamCMD `app_update` call. The `GAME_BINARY_PATH` volume entry in `docker-compose.yml` can then be removed. Everything else — compose file, volumes, dashboard — stays identical.

---

## Documentation

- [`docs/ORMOD_RCON_ARCHITECTURE.md`](docs/ORMOD_RCON_ARCHITECTURE.md) — full architecture, schema, services, API routes
- [`docs/UI_DESIGN_SYSTEM.md`](docs/UI_DESIGN_SYSTEM.md) — design system, colors, fonts, component rules

---

## Contributing

Issues and pull requests are welcome. If you want to add a feature, open an issue first to discuss the approach.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use and contribute to, no commercial use permitted.
