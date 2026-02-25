# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in ormod-rcon, please report it responsibly.

**Do not open a public issue.** Instead, email the maintainer directly:

- GitHub: [@Nerveyyyy](https://github.com/Nerveyyyy) (use GitHub's private vulnerability reporting if available)

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 72 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

This policy covers the ormod-rcon dashboard application:

- Fastify API (`apps/api/`)
- React frontend (`apps/web/`)
- Docker configuration (`docker/`, `docker-compose.yml`)
- Authentication and session management

## Best practices for self-hosters

- Always set `BETTER_AUTH_SECRET` to a strong random value (`openssl rand -hex 32`)
- Bind the dashboard to a private interface or put it behind a reverse proxy with HTTPS
- Keep Docker and the host OS updated
- Do not expose the Docker socket to untrusted networks
