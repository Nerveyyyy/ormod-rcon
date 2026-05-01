import { Type, type Static } from '@sinclair/typebox'
import { listEnvelopeSchema } from './pagination.js'

/**
 * Summary shape returned by the list endpoint. Intentionally narrow —
 * the full server row contains credentials and low-level RCON metadata
 * that should never cross the wire in a list response.
 */
export const serverSummarySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  handle: Type.String(),
  name: Type.String(),
  region: Type.Union([ Type.String(), Type.Null() ]),
  enabled: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
})

export type ServerSummary = Static<typeof serverSummarySchema>

export const listServersResponseSchema = listEnvelopeSchema(serverSummarySchema)

export type ListServersResponse = Static<typeof listServersResponseSchema>

/**
 * Discriminator the dashboard switches on to render a localized message
 * for a non-healthy connection. The literal list must match the matching
 * TS-only `LastErrorReasonCode` in `@ormod/eventing`. Drift is caught at
 * compile time at any site that assigns one shape into the other (e.g.
 * the supervisor's status mapper).
 */
export const LAST_ERROR_REASON_CODES = [
  'auth_failed',
  'initial_connect_failed',
  'connection_lost',
  'unreachable_after_30s',
  'disabled_after_24h',
] as const

export const lastErrorReasonCodeSchema = Type.Union([
  Type.Literal('auth_failed'),
  Type.Literal('initial_connect_failed'),
  Type.Literal('connection_lost'),
  Type.Literal('unreachable_after_30s'),
  Type.Literal('disabled_after_24h'),
])

export type LastErrorReasonCode = Static<typeof lastErrorReasonCodeSchema>

const REASON_CODE_SET: ReadonlySet<string> = new Set(LAST_ERROR_REASON_CODES)

/** Defensive narrow for values read from the `text` column. Treats any
 * value not in the canonical list as `null` so a stale free-text reason
 * left over from older code doesn't fail response validation. */
export const narrowLastErrorReason = (
  raw: string | null,
): LastErrorReasonCode | null => {
  if (raw === null) return null
  return REASON_CODE_SET.has(raw) ? (raw as LastErrorReasonCode) : null
}

/**
 * Live connection state for a single server. Sourced from the
 * `server_runtime` row the supervisor upserts on every connection-state
 * transition. Null when no runtime row exists yet (server created, not
 * yet dialled).
 */
export const serverRuntimeSchema = Type.Object({
  state: Type.Union([
    Type.Literal('connecting'),
    Type.Literal('connected'),
    Type.Literal('disconnected'),
    Type.Literal('errored'),
  ]),
  playerCount: Type.Union([ Type.Integer(), Type.Null() ]),
  latencyMs: Type.Union([ Type.Integer(), Type.Null() ]),
  lastConnectedAt: Type.Union([
    Type.String({ format: 'date-time' }),
    Type.Null(),
  ]),
  lastErrorReason: Type.Union([ lastErrorReasonCodeSchema, Type.Null() ]),
})

export type ServerRuntime = Static<typeof serverRuntimeSchema>

export const serverDetailSchema = Type.Composite([
  serverSummarySchema,
  Type.Object({
    rconHost: Type.String(),
    rconPort: Type.Integer(),
    runtime: Type.Union([ serverRuntimeSchema, Type.Null() ]),
  }),
])

export type ServerDetail = Static<typeof serverDetailSchema>

/**
 * Fields the operator supplies when registering a server. `handle` is a
 * short slug used in URLs and chat prefixes; it must be unique within
 * the organization.
 */
export const createServerRequestSchema = Type.Object({
  handle: Type.String({
    minLength: 1,
    maxLength: 64,
    pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$',
  }),
  name: Type.String({ minLength: 1, maxLength: 128 }),
  region: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  rconHost: Type.String({ minLength: 1, maxLength: 255 }),
  rconPort: Type.Integer({ minimum: 1, maximum: 65535 }),
  rconPassword: Type.String({ minLength: 1 }),
})

export type CreateServerRequest = Static<typeof createServerRequestSchema>

/**
 * POST /api/servers returns the full ServerDetail of the freshly
 * created row, so the client never needs a follow-up GET.
 */
export const createServerResponseSchema = serverDetailSchema

export type CreateServerResponse = Static<typeof createServerResponseSchema>
