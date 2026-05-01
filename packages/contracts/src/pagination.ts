import { Type, type Static, type TSchema } from '@sinclair/typebox'

/**
 * Common query fragment every list endpoint extends.
 *
 * - `cursor` is opaque to clients — base64(JSON({ sort, last })). Server
 *   rejects it with 400 if the encoded sort no longer matches the
 *   request's `sort`.
 * - `limit` defaults to 50 and is clamped to [1, 100] server-side.
 *   Fastify's Ajv coerces the querystring value to an integer.
 * - `sort` is `field` (asc) or `-field` (desc); valid fields are
 *   declared per-endpoint.
 * - `include=total` opts the response into a `total` count. Skipped by
 *   default because the COUNT(*) costs noticeably on large tables.
 */
export const listQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Integer({ minimum: 1, maximum: 100, default: 50 }),
  sort: Type.Optional(Type.String({ minLength: 1 })),
  include: Type.Optional(Type.String()),
})

export type ListQuery = Static<typeof listQuerySchema>

/**
 * Generic envelope for list responses. `next_cursor` and `total` are
 * omitted entirely (rather than set to null) when not applicable —
 * `has_more: false` is unambiguous on its own and `total` is opt-in
 * via `?include=total`.
 */
export const listEnvelopeSchema = <T extends TSchema>(item: T) => {
  return Type.Object({
    data: Type.Array(item),
    has_more: Type.Boolean(),
    next_cursor: Type.Optional(Type.String()),
    total: Type.Optional(Type.Integer({ minimum: 0 })),
  })
}

export interface ListEnvelope<T> {
  data: T[]
  has_more: boolean
  next_cursor?: string
  total?: number
}
