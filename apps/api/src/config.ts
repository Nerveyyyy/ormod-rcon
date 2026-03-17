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
    PORT: { type: 'number', default: 3001 },
    HOST: { type: 'string', default: 'localhost' },
    PUBLIC_URL: { type: 'string', default: '' },
    STATIC_PATH: { type: 'string', default: '' },
    BETTER_AUTH_SECRET: { type: 'string', minLength: 32 },
    DATABASE_URL: { type: 'string' },
    DOCKER_SOCKET: { type: 'string', default: '/var/run/docker.sock' },
    DOCKER_HOST: { type: 'string', default: '' },
    GAME_CONTAINER_NAME: { type: 'string', default: 'ormod-game' },
    TLS_CERT_PATH: { type: 'string', default: '' },
    TLS_KEY_PATH: { type: 'string', default: '' },
    LOG_LEVEL: { type: 'string', default: 'info' },
  },
} as const

export type EnvConfig = {
  PORT: number
  HOST: string
  PUBLIC_URL: string
  STATIC_PATH: string
  BETTER_AUTH_SECRET: string
  DATABASE_URL: string
  DOCKER_SOCKET: string
  DOCKER_HOST: string
  GAME_CONTAINER_NAME: string
  TLS_CERT_PATH: string
  TLS_KEY_PATH: string
  LOG_LEVEL: string
}

/**
 * Compute the list of allowed CORS/trusted origins.
 *
 * - If PUBLIC_URL is set (production / Docker): that URL only.
 * - Otherwise: localhost variants on the given port so local dev just works.
 */
export function computeOrigins(publicUrl: string, _port: number | string): string[] {
  if (publicUrl) return [publicUrl]
  // Local dev: trust any localhost origin regardless of port.
  // Vite defaults to :3000, API to :3001, but users may change either.
  return ['http://localhost:*', 'http://127.0.0.1:*']
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
