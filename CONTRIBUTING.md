# Contributing to ormod-rcon

Thanks for your interest in contributing! This project is open for community contributions under the [PolyForm Noncommercial 1.0.0](LICENSE) license.

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for full integration testing)

### Local development

```bash
git clone https://github.com/Nerveyyyy/ormod-rcon
cd ormod-rcon
pnpm install

# Create a root .env from the example
cp .env.example .env
# Edit .env: set DATABASE_URL=file:./ormod-rcon.db

# Run database migrations
cd apps/api && npx prisma migrate dev && cd ../..

# Start dev servers (API on :3001, web on :3000)
pnpm dev
```

The API dev script loads `../../.env` automatically via `--env-file`.

### Project structure

```
apps/api/src/
  plugins/       Fastify plugins (autoloaded, dependency-ordered)
  routes/        Route definitions (fastify.route + JSON schemas)
  controllers/   Handler logic (business logic + DB queries)
  services/      Domain services (Docker, file I/O, wipe, RCON)
  lib/           Shared library code (auth config)
  db/            Prisma client singleton
  config.ts      Env schema + Fastify type augmentation
  app.ts         Builds the Fastify instance (testable)
  server.ts      Entry point (listen + post-startup tasks)

apps/web/src/
  pages/         Page components (one per tab)
  components/    UI components (layout/ and ui/)
  hooks/         React hooks
  api/           Typed fetch wrapper
  context/       React context providers
```

## How to contribute

### Reporting bugs

Open an [issue](https://github.com/Nerveyyyy/ormod-rcon/issues) using the **Bug report** template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Docker version, browser)
- Relevant logs or screenshots

### Suggesting features

Open an [issue](https://github.com/Nerveyyyy/ormod-rcon/issues) using the **Feature request** template. Describe the problem you're trying to solve and your proposed solution.

### Submitting code

1. **Open an issue first** to discuss the approach before writing code
2. Fork the repo and create a feature branch from `master`
3. Make your changes
4. Ensure the TypeScript build passes: `cd apps/api && npx tsc --noEmit`
5. Test your changes locally with `pnpm dev`
6. Open a pull request against `master`

### Code style

- TypeScript strict mode is enabled
- Use named exports for controller functions
- Use `fastify.route()` with JSON schemas for route definitions
- Keep handler logic in `controllers/`, route wiring in `routes/`
- Follow existing patterns — look at neighboring files for reference

### Commit messages

Use short, descriptive commit messages in imperative mood:

```
add player kick confirmation dialog
fix wipe backup path on Windows
update schedule cron validation schema
```

## Questions?

Open a [discussion](https://github.com/Nerveyyyy/ormod-rcon/discussions) or reach out via the issue tracker.
