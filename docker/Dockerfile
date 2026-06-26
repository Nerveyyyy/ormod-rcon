# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
ENV DO_NOT_TRACK=1
RUN corepack enable
WORKDIR /app

# prune each app into its own isolated subgraph so their deps never mix
FROM base AS pruner
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune @ormod/api --docker --out-dir out-api
RUN turbo prune @ormod/web --docker --out-dir out-web

# build the SPA in its own workspace
FROM base AS web
COPY --from=pruner /app/out-web/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY --from=pruner /app/out-web/full/ .
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
  pnpm build

# build the api in its own workspace, then carve out a prod-only deploy
FROM base AS api
COPY --from=pruner /app/out-api/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY --from=pruner /app/out-api/full/ .
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
  pnpm build
# --no-optional drops the optional peers better-auth and drizzle-orm declare
# (every framework + db driver they can integrate with); pnpm resolves them
# against the workspace and would otherwise ship ~150MB of unused tooling.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @ormod/api deploy --prod --no-optional /prod/api

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api --chown=node:node /prod/api ./
COPY --from=web --chown=node:node /app/apps/web/dist ./web
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
