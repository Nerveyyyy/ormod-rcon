# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:

1. Go to https://github.com/Nerveyyyy/ormod-rcon/security/advisories/new
2. Fill in what you found, how to reproduce it, and the potential impact

If you can't use GitHub for any reason, email [@Nerveyyyy](https://github.com/Nerveyyyy) directly.

### What to expect

- Initial response within **72 hours**.
- We'll coordinate a fix with you privately before any public disclosure.
- Target window from first contact to a released fix is **90 days**. If a fix needs longer we'll say so and explain why.
- Once a fix is released, we'll publish a GitHub Security Advisory crediting you (unless you prefer to stay anonymous).

## Scope

This policy covers vulnerabilities in ormod-rcon itself:

- API (`apps/api/`)
- Web dashboard (`apps/web/`)
- Shared packages under `packages/`
- Docker images and `docker/compose.yaml` as shipped in this repo
- Authentication, session handling, and tenant isolation

Vulnerabilities in third-party dependencies we ship are in scope — report them here and we'll coordinate with upstream if needed.

**Out of scope:**

- Your own self-hosted deployment misconfigurations (exposed Docker socket, weak secrets, missing TLS, etc.)
- The ORMOD: Directive game server itself — report those to the game's developer.

## Best practices for self-hosters

- Generate strong random secrets for `BETTER_AUTH_SECRET` and `ORMOD_SECRET_KEY` (`openssl rand -hex 32`).
- Never commit your `.env` file. Rotate secrets if you suspect leakage.
- Put the dashboard behind a reverse proxy with HTTPS. Do not expose it directly to the internet on plain HTTP.
- Keep Docker images and the host OS patched.
- Do not mount the Docker socket into containers on an untrusted network.
- Back up your Postgres volume regularly.
