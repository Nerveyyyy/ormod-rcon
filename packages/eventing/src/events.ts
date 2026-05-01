/**
 * Typed event maps used by the bus.
 *
 * Two layers are kept separate on purpose:
 *
 *   - DomainEventMap      internal, normalised, shaped to the dashboard's
 *                         needs. Free to evolve; consumers are all in-tree.
 *
 *   - IntegrationEventMap public contract. Shapes are versioned (.v1, .v2,
 *                         ...) so an external consumer pinned to .v1 keeps
 *                         working while .v2 introduces a breaking change.
 *
 * The starting set is intentionally small — enough to prove the typing
 * and fan-out work end-to-end. More events land alongside the features
 * that emit them.
 */

export interface PlayerJoinedPayload {
  serverId: string
  playerId: string
  steamId: string
  name: string
  ip: string
  at: Date
}

export interface PlayerLeftPayload {
  serverId: string
  playerId: string
  sessionSeconds: number
  at: Date
}

/**
 * Discriminator the dashboard switches on to render a localized message
 * for a non-healthy connection. Free-form strings are deliberately not
 * supported — every code listed here MUST appear in the matching TypeBox
 * union in `@ormod/contracts/servers`. Adding a value to one without the
 * other is caught at compile time at any site that assigns one type into
 * the other shape (e.g. the supervisor's status mapper).
 */
export type LastErrorReasonCode =
  | 'auth_failed'
  | 'initial_connect_failed'
  | 'connection_lost'
  | 'unreachable_after_30s'
  | 'disabled_after_24h'

export interface ServerStatusPayload {
  serverId: string
  state: 'connecting' | 'connected' | 'disconnected' | 'errored'
  playerCount: number | null
  lastErrorReason: LastErrorReasonCode | null
  at: Date
}

export interface DomainEventMap {
  'player.joined': PlayerJoinedPayload
  'player.left': PlayerLeftPayload
  'server.status': ServerStatusPayload
}

export type DomainEventName = keyof DomainEventMap

/**
 * Public, versioned mirror of the domain events. Consumers pin to a
 * specific version in their webhook / subscription config; emitting a
 * breaking shape change means publishing a new `.vN` alongside the old.
 */
export interface IntegrationEventMap {
  'ormod.player.joined.v1': PlayerJoinedPayload
  'ormod.player.left.v1': PlayerLeftPayload
  'ormod.server.status.v1': ServerStatusPayload
}

export type IntegrationEventName = keyof IntegrationEventMap
