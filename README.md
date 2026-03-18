<p align="center">
  <h1 align="center">ORMOD RCON Dashboard</h1>
  <p align="center">
    Self-hosted server management dashboard for <strong>ORMOD: Directive</strong> dedicated servers.
    <br />
    <a href="https://github.com/Nerveyyyy/ormod-rcon/wiki"><strong>Read the Wiki</strong></a>
    &nbsp;&middot;&nbsp;
    <a href="https://github.com/Nerveyyyy/ormod-rcon/issues">Report Bug</a>
    &nbsp;&middot;&nbsp;
    <a href="https://discord.gg/placeholder">Discord</a>
  </p>
</p>

<p align="center">
  <a href="https://github.com/Nerveyyyy/ormod-rcon/wiki/Features-Overview">
    <img src="https://img.shields.io/badge/features-11%20pages-blue" alt="Features" />
  </a>
  <a href="https://github.com/Nerveyyyy/ormod-rcon/wiki/Installation">
    <img src="https://img.shields.io/badge/deploy-Docker-2496ED?logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-PolyForm%20NC%201.0-green" alt="License" />
  </a>
</p>

---

## What Is This?

A web dashboard that lets you manage your ORMOD: Directive game servers from a browser. Think **RustAdmin** or **HLL Community RCON** -- but for ORMOD.

**No RCON required.** The dashboard controls game containers through the Docker API. When ORMOD adds native RCON, the dashboard will switch automatically with zero config changes.

### Key Features

| Feature | Description |
|---------|-------------|
| **Live Console** | Stream server output in real time, send commands via stdin |
| **Player Management** | View, kick, ban, teleport, heal, set permissions |
| **Server Settings** | Live-edit `serversettings.json` with instant hot-reload |
| **Access Control** | Shared ban/whitelist/admin lists with cross-server sync |
| **Wipe Manager** | Map, full, player, or custom wipes with backup + history |
| **Schedules** | Cron-based restarts, commands, and automation |
| **Multi-Server** | Manage multiple servers from one dashboard |
| **Role-Based Auth** | OWNER / ADMIN / VIEWER with session-based security |

> **Full feature walkthrough with screenshots:** [Wiki - Features Overview](https://github.com/Nerveyyyy/ormod-rcon/wiki/Features-Overview)

---

## How It Works

```
              Docker Socket (/var/run/docker.sock)
                              |
        ┌─────────────────────┴───────────────────────┐
        |                                             |
  ┌─────┴───────────┐                    ┌────────────┴───────────┐
  │  ormod-server   │                    │    ormod-dashboard     │
  │                 │                    │                        │
  │   Game binary   │  stdin via docker  │      Fastify API       │
  │   (dedicated    │◄────── exec ───────│       React UI         │
  │    server)      │                    │       SQLite DB        │
  │                 │                    │       Port 3000        │
  └─────────────────┘                    └────────────────────────┘
```

> **Using our ORMOD: Directive Dedicated Server image?** See [ormod-server](https://github.com/Nerveyyyy/ormod-server) for the Docker game server. The dashboard's `docker-compose.yml` includes it automatically.

---

## Quick Start

**Requirements:** Docker + Docker Compose v2

```bash
git clone https://github.com/Nerveyyyy/ormod-rcon.git
cd ormod-rcon

cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET (run: openssl rand -hex 32)
#            — set PUBLIC_URL (e.g. http://192.168.1.100:3000)

docker compose up -d
```

Open `http://<your-ip>:3000`, create your owner account, and you're in.

> **Internet-facing?** Use the hardened compose with socket proxy:
> ```bash
> docker compose -f docker-compose.secure.yml up -d
> ```
> See [Wiki - Hardened Deployment](https://github.com/Nerveyyyy/ormod-rcon/wiki/Hardened-Deployment) for details.

### Dashboard-Only Mode

Already running the game server separately? Use the dashboard-only compose:

```bash
docker compose -f docker-compose.dashboard.yml up -d
```

Set `GAME_CONTAINER_NAME` in `.env` to your game container's name.

---

## Configuration

All settings live in `.env` (copied from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | _(required)_ | Session encryption -- `openssl rand -hex 32` |
| `PUBLIC_URL` | _(empty)_ | URL clients use to reach the dashboard |
| `GAME_CONTAINER_NAME` | `ormod-server` | Docker container name of the game server |
| `DASHBOARD_PORT` | `3000` | Host port for the dashboard |

> **Full configuration reference:** [Wiki - Installation](https://github.com/Nerveyyyy/ormod-rcon/wiki/Installation)

---

## Compose Variants

| File | Game Server | Dashboard | Socket Proxy |
|------|:-----------:|:---------:|:------------:|
| `docker-compose.yml` | yes | yes | -- |
| `docker-compose.secure.yml` | yes | yes | yes |
| `docker-compose.dashboard.yml` | -- | yes | -- |
| `docker-compose.dashboard-secure.yml` | -- | yes | yes |

---

## Documentation

**Everything is in the [Wiki](https://github.com/Nerveyyyy/ormod-rcon/wiki).** Here are the key sections:

| Section | What You'll Find |
|---------|-----------------|
| [Features Overview](https://github.com/Nerveyyyy/ormod-rcon/wiki/Features-Overview) | All 11 pages with screenshots |
| [Installation](https://github.com/Nerveyyyy/ormod-rcon/wiki/Installation) | Step-by-step deployment guide |
| [First-Run Setup](https://github.com/Nerveyyyy/ormod-rcon/wiki/First-Run-Setup) | Creating your first account |
| [Hardened Deployment](https://github.com/Nerveyyyy/ormod-rcon/wiki/Hardened-Deployment) | Socket proxy + non-root for production |
| [Common Issues](https://github.com/Nerveyyyy/ormod-rcon/wiki/Common-Issues) | Troubleshooting FAQ |
| [Local Development](https://github.com/Nerveyyyy/ormod-rcon/wiki/Local-Development) | Dev setup for contributors |
| [API Reference](https://github.com/Nerveyyyy/ormod-rcon/wiki/API-Reference) | All HTTP + WebSocket endpoints |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4 |
| Backend | Fastify 5, TypeScript, Node.js 20+ |
| Database | SQLite via Prisma 7 |
| Auth | BetterAuth (session-based, email+password) |
| Realtime | WebSocket (`@fastify/websocket`) |
| Scheduling | `node-cron` |
| Deployment | Docker (single combined container) |

---

## Contributing

Issues and pull requests are welcome. See the [Local Development](https://github.com/Nerveyyyy/ormod-rcon/wiki/Local-Development) wiki page for setup instructions.

---

## Community

- **Discord:** [discord.gg/placeholder](https://discord.gg/placeholder)
- **Issues:** [GitHub Issues](https://github.com/Nerveyyyy/ormod-rcon/issues)
- **Wiki:** [Full Documentation](https://github.com/Nerveyyyy/ormod-rcon/wiki)

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) - free to use and contribute to, no commercial use permitted.
