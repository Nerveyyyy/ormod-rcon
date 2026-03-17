/**
 * _schemas.ts — Shared JSON Schema fragments reused across route files.
 *
 * Centralises the most-duplicated parameter schema objects so changes only
 * need to be made in one place.
 */

export const serverParams = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  required: ['id'],
} as const

export const entryParams = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    entryId: { type: 'string' },
  },
  required: ['id', 'entryId'],
} as const
