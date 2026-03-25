/**
 * _schemas.ts — Shared JSON Schema fragments reused across route files.
 *
 * Centralises the most-duplicated parameter schema objects so changes only
 * need to be made in one place.
 */

export const serverParams = {
  type: 'object',
  properties: {
    serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
  },
  required: ['serverName'],
} as const

export const listParams = {
  type: 'object',
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
  },
  required: ['slug'],
} as const

export const scheduleParams = {
  type: 'object',
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
  },
  required: ['slug'],
} as const

export const paginationQuery = {
  type: 'object',
  properties: {
    page:  { type: 'string', default: '1' },
    limit: { type: 'string', default: '50' },
  },
} as const

export const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

export const paginatedResponse = (itemSchema: object) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: itemSchema },
    page: { type: 'number' },
    limit: { type: 'number' },
    total: { type: 'number' },
  },
}) as const

export const listServerParams = {
  type: 'object',
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
    serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
  },
  required: ['slug', 'serverName'],
} as const

export const entryParams = {
  type: 'object',
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
    steamId: { type: 'string' },
  },
  required: ['slug', 'steamId'],
} as const
