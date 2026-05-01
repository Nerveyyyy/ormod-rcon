# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: install the whole workspace and build every package.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=1

RUN corepack enable

WORKDIR /app

# Copy lockfile and workspace metadata first so the install layer caches
# when only source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps ./apps
COPY packages ./packages

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build every workspace package (Drizzle schema, contracts, eventing, web
# static assets). The API type-checks via `tsc --noEmit` and runs directly
# from source with tsx.
RUN pnpm -r build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — runner: minimal node image, non-root user, production entry.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
 && addgroup -S app \
 && adduser -S -G app -u 1001 app \
 && apk add --no-cache wget

WORKDIR /app

# Copy the full built workspace. Keeping pnpm's symlinked node_modules
# intact is simpler than re-installing in the runner and avoids a native
# rebuild pass.
COPY --from=builder --chown=app:app /app /app

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

CMD ["pnpm", "--filter", "@ormod-rcon/api", "start"]
