/**
 * config.ts — Environment variable JSON Schema + Fastify type augmentation.
 *
 * Used by @fastify/env (plugins/env.ts) to validate and expose env vars as
 * fastify.config.* with full TypeScript typing.
 */

export const envSchema = {
  type: 'object',
  required: ['DATABASE_URL', 'BETTER_AUTH_SECRET'],
  additionalProperties: true, // allow Docker-compose-only vars
  properties: {
    API_PORT: { type: 'number', default: 3001 },
    API_HOST: { type: 'string', default: 'localhost' },
    WEB_HOST: { type: 'string', default: 'localhost' },
    WEB_PORT: { type: 'number', default: 3000 },
    PUBLIC_URL: { type: 'string', default: '' },
    NODE_ENV: { type: 'string', default: 'development' },
    STATIC_PATH: { type: 'string', default: '' },
    BETTER_AUTH_SECRET: { type: 'string', minLength: 32 },
    DATABASE_URL: { type: 'string' },
    DOCKER_SOCKET: { type: 'string', default: '/var/run/docker.sock' },
    DOCKER_HOST: { type: 'string', default: '' },
    DOCKER_CONTROL_ENABLED: { type: 'boolean', default: true },
    GAME_CONTAINER_NAME: { type: 'string', default: 'ormod-game' },
    TLS_CERT_PATH: { type: 'string', default: '' },
    TLS_KEY_PATH: { type: 'string', default: '' },
    LOG_LEVEL: { type: 'string', default: 'info' },
  },
} as const

export type EnvConfig = {
  API_PORT: number
  API_HOST: string
  WEB_HOST: string
  WEB_PORT: number
  PUBLIC_URL: string
  NODE_ENV: string
  STATIC_PATH: string
  BETTER_AUTH_SECRET: string
  DATABASE_URL: string
  DOCKER_SOCKET: string
  DOCKER_HOST: string
  DOCKER_CONTROL_ENABLED: boolean
  GAME_CONTAINER_NAME: string
  TLS_CERT_PATH: string
  TLS_KEY_PATH: string
  LOG_LEVEL: string
}

/**
 * Compute the list of allowed CORS/trusted origins.
 *
 * - If PUBLIC_URL is set (production / Docker): that URL only.
 * - Otherwise: derive from WEB_HOST:WEB_PORT, automatically including
 *   both localhost and 127.0.0.1 variants so local dev just works.
 */
export function computeOrigins(
  publicUrl: string,
  webHost: string,
  webPort: number | string,
  tlsCertPath?: string
): string[] {
  if (publicUrl) return [publicUrl]
  const scheme = tlsCertPath ? 'https' : 'http'
  const base = `${scheme}://${webHost}:${webPort}`
  const origins = new Set([base])
  if (webHost === 'localhost') origins.add(`${scheme}://127.0.0.1:${webPort}`)
  if (webHost === '127.0.0.1') origins.add(`${scheme}://localhost:${webPort}`)
  return [...origins]
}

// ── Session type (attached by auth plugin preHandler) ────────────────────────

export type SessionUser = {
  id: string
  email: string
  name: string
  role: string
}

export type SessionData = {
  user: SessionUser
  session: { id: string; expiresAt: Date }
}

// ── Fastify module augmentation ──────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvConfig
  }
  interface FastifyRequest {
    session?: SessionData
  }
}
