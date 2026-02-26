/**
 * config.ts — Environment variable JSON Schema + Fastify type augmentation.
 *
 * Used by @fastify/env (plugins/env.ts) to validate and expose env vars as
 * fastify.config.* with full TypeScript typing.
 */

export const envSchema = {
  type: 'object',
  required: ['DATABASE_URL'],
  additionalProperties: true, // allow Docker-compose-only vars
  properties: {
    API_PORT:               { type: 'number',  default: 3001 },
    API_HOST:               { type: 'string',  default: 'localhost' },
    WEB_HOST:               { type: 'string',  default: 'localhost' },
    WEB_PORT:               { type: 'number',  default: 3000 },
    PUBLIC_URL:             { type: 'string',  default: '' },
    NODE_ENV:               { type: 'string',  default: 'development' },
    STATIC_PATH:            { type: 'string',  default: '' },
    BETTER_AUTH_SECRET:     { type: 'string',  default: '' },
    DATABASE_URL:           { type: 'string' },
    DOCKER_SOCKET:          { type: 'string',  default: '/var/run/docker.sock' },
    DOCKER_HOST:            { type: 'string',  default: '' },
    DOCKER_CONTROL_ENABLED: { type: 'string',  default: 'true' },
    GAME_CONTAINER_NAME:    { type: 'string',  default: 'ormod-game' },
    SAVE_BASE_PATH:         { type: 'string',  default: '' },
    SAVES_PATH:             { type: 'string',  default: '' },
    BACKUP_PATH:            { type: 'string',  default: './backups' },
  },
} as const;

export type EnvConfig = {
  API_PORT:               number;
  API_HOST:               string;
  WEB_HOST:               string;
  WEB_PORT:               number;
  PUBLIC_URL:             string;
  NODE_ENV:               string;
  STATIC_PATH:            string;
  BETTER_AUTH_SECRET:     string;
  DATABASE_URL:           string;
  DOCKER_SOCKET:          string;
  DOCKER_HOST:            string;
  DOCKER_CONTROL_ENABLED: string;
  GAME_CONTAINER_NAME:    string;
  SAVE_BASE_PATH:         string;
  SAVES_PATH:             string;
  BACKUP_PATH:            string;
};

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
): string[] {
  if (publicUrl) return [publicUrl];
  const base = `http://${webHost}:${webPort}`;
  const origins = new Set([base]);
  if (webHost === 'localhost')  origins.add(`http://127.0.0.1:${webPort}`);
  if (webHost === '127.0.0.1') origins.add(`http://localhost:${webPort}`);
  return [...origins];
}

// ── Session type (attached by auth plugin preHandler) ────────────────────────

export type SessionUser = {
  id:    string;
  email: string;
  name:  string;
  role:  string;
};

export type SessionData = {
  user:    SessionUser;
  session: { id: string; expiresAt: Date };
};

// ── Fastify module augmentation ──────────────────────────────────────────────

import type { PrismaClient } from '../prisma/generated/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvConfig;
    prisma: PrismaClient;
  }
  interface FastifyRequest {
    session?: SessionData;
  }
}
