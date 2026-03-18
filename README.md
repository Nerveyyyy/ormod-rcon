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

```
┌──────────────────────────┐                  ┌──────────────────────────────┐
│   ormod-server             │                  │   ormod-dashboard            │
│                          │                  │                              │
│  ghcr.io/nerveyyyy/      │                  │  Fastify API + React UI      │
│    ormod-server:latest   │                  │  Controls game via Docker API│
│  ORMODDirective binary   │                  │  port 3000                   │
└──────────────────────────┘                  └──────────────────────────────┘
         ↑ stdin via docker exec                        ↑
         └──────────────────────────────────────────────┘
                         /var/run/docker.sock
```

The dashboard communicates with the game container via the Docker socket — no sidecar agents, no RCON (until the game adds it). The game server is a separate published image; all interaction is through Docker exec commands.

---

## Quick Start

### Requirements

- Docker + Docker Compose (Docker Desktop on Windows/Mac, Docker Engine on Linux)

### 1. Clone and configure

```bash
git clone https://github.com/Nerveyyyy/ormod-rcon
cd ormod-rcon

cp .env.example .env
# Edit .env — at minimum set:
#   BETTER_AUTH_SECRET    (run: openssl rand -hex 32)
#   PUBLIC_URL            (e.g. http://192.168.1.100:3000)
```

### 2. Start

```bash
docker compose up -d
```

This pulls the game server image from GHCR and builds the dashboard. The dashboard is available at `http://<server-ip>:3000` (or whatever `DASHBOARD_PORT` is set to).

For internet-facing servers, use the hardened variant with a socket proxy:

```bash
docker compose -f docker-compose.secure.yml up -d
```

### Dashboard-only deployment

If your game server runs separately (its own host, standalone Docker run, etc.), use the dashboard-only compose files:

```bash
# Standard:
docker compose -f docker-compose.dashboard.yml up -d

# Hardened (socket proxy):
docker compose -f docker-compose.dashboard-secure.yml up -d
```

Set `GAME_CONTAINER_NAME` in `.env` to the name of your game container. Both containers must be visible to the same Docker daemon.

---

## Configuration

All settings live in `.env` (copied from `.env.example`):

| Variable              | Default                    | Description                                                         |
| --------------------- | -------------------------- | ------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`  | _(required)_               | Random secret for session tokens — run `openssl rand -hex 32`       |
| `GAME_CONTAINER_NAME` | `ormod-server`               | Docker container name the dashboard connects to                     |
| `GAME_PORT`           | `27015`                    | UDP game port (host-side mapping, must match `serversettings.json`) |
| `QUERY_PORT`          | `27016`                    | UDP query port (host-side mapping)                                  |
| `KCP_PORT`            | `7777`                     | UDP KCP port (host-side mapping)                                    |
| `DASHBOARD_PORT`      | `3000`                     | Host port for the dashboard                                         |
| `PUBLIC_URL`          | _(empty)_                  | URL clients use to reach the dashboard (required for Docker)        |
| `DATABASE_URL`        | `file:/data/ormod-rcon.db` | SQLite path inside the dashboard container                          |

---

## Compose files

| File                                 | Game server | Dashboard | Socket proxy |
| ------------------------------------ | ----------- | --------- | ------------ |
| `docker-compose.yml`                 | yes         | yes       | no           |
| `docker-compose.secure.yml`          | yes         | yes       | yes          |
| `docker-compose.dashboard.yml`       | no          | yes       | no           |
| `docker-compose.dashboard-secure.yml`| no          | yes       | yes          |

Use `docker-compose.override.yml` for any local customisation (TLS certs, port overrides, etc.) — it auto-merges with whichever base file you use and should be gitignored.

---

## Registering Additional Servers

Add more servers through the **Servers** page in the dashboard UI. Each server needs a `GAME_CONTAINER_NAME` that the dashboard can reach via the Docker socket.

Access lists can be shared and synced across all registered servers simultaneously.

---

## Repo Layout

```
ormod-rcon/
├── apps/
│   ├── api/                      # Fastify backend (TypeScript)
│   │   └── src/
│   │       ├── app.ts            # Builds Fastify instance (testable)
│   │       ├── server.ts         # Entry point (listen + startup tasks)
│   │       ├── config.ts         # Env schema + Fastify type augmentation
│   │       ├── plugins/          # Autoloaded (fp dependency graph)
│   │       ├── routes/           # Route definitions (fastify.route + schemas)
│   │       ├── controllers/      # Handler logic (business logic + DB)
│   │       └── services/         # Domain services (Docker, RCON adapter)
│   └── web/                      # React frontend (Vite + Tailwind)
├── docker/
│   ├── Dockerfile.dashboard      # API + React static (combined container)
│   └── entrypoint-dashboard.sh
├── docs/
│   ├── architecture.md
│   └── design-system.md
├── docker-compose.yml                    # Combined (game + dashboard)
├── docker-compose.secure.yml             # Combined + socket proxy
├── docker-compose.dashboard.yml          # Dashboard only
├── docker-compose.dashboard-secure.yml   # Dashboard only + socket proxy
└── .env.example
```

---

## Future: RCON Support

When ORMOD: Directive adds WebSocket RCON, the command dispatch path will switch automatically. The `rcon-adapter.ts` service already has a `WebSocketRconAdapter` stub — fill in the `rconPort` and `rconPass` per server in the UI and commands will route through RCON instead of Docker exec. No UI changes required.

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — full architecture, schema, services, API routes
- [`docs/design-system.md`](docs/design-system.md) — design system, colors, fonts, component rules

---

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use and contribute to, no commercial use permitted.