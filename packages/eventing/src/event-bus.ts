import type { DomainEventMap, DomainEventName } from './events.js'

/**
 * Context attached to every published event. Kept small and serialisable
 * so it can ride along through any future durable transport (outbox,
 * queue, webhook) without change.
 */
export interface EventContext {
  tenantId: string
  serverId?: string
  correlationId?: string
}

/**
 * Handler invoked when an event fires. Handlers may be async; the bus
 * awaits them. Throwing does not break fan-out — other handlers for the
 * same event still run.
 */
export type EventHandler<E extends DomainEventName> = (
  payload: DomainEventMap[E],
  ctx: EventContext,
) => void | Promise<void>

/**
 * Wildcard handler called for every event. Useful for logging, auditing,
 * or tee-ing to a durable sink.
 */
export type WildcardEventHandler = <E extends DomainEventName>(
  event: E,
  payload: DomainEventMap[E],
  ctx: EventContext,
) => void | Promise<void>

/** Returned from subscribe(); call to detach the handler. */
export type Unsubscribe = () => void

export interface EventBus {
  publish<E extends DomainEventName> (
    event: E,
    payload: DomainEventMap[E],
    ctx: EventContext,
  ): Promise<void>

  subscribe<E extends DomainEventName> (
    event: E,
    handler: EventHandler<E>,
  ): Unsubscribe

  subscribeAll (handler: WildcardEventHandler): Unsubscribe
}

/** Minimal logger shape the bus uses — any Pino-like logger matches. */
export interface BusLogger {
  error (obj: Record<string, unknown>, msg?: string): void
}
