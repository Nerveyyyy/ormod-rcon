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
    PORT:                   { type: 'number',  default: 3001 },
    CORS_ORIGIN:            { type: 'string',  default: 'http://localhost:3000' },
    NODE_ENV:               { type: 'string',  default: 'development' },
    STATIC_PATH:            { type: 'string',  default: '' },
    BETTER_AUTH_SECRET:     { type: 'string',  default: '' },
    JWT_SECRET:             { type: 'string',  default: '' },
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
  PORT:                   number;
  CORS_ORIGIN:            string;
  NODE_ENV:               string;
  STATIC_PATH:            string;
  BETTER_AUTH_SECRET:     string;
  JWT_SECRET:             string;
  DATABASE_URL:           string;
  DOCKER_SOCKET:          string;
  DOCKER_HOST:            string;
  DOCKER_CONTROL_ENABLED: string;
  GAME_CONTAINER_NAME:    string;
  SAVE_BASE_PATH:         string;
  SAVES_PATH:             string;
  BACKUP_PATH:            string;
};

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

import type { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvConfig;
    prisma: PrismaClient;
  }
  interface FastifyRequest {
    session?: SessionData;
  }
}
