import type { DomainEventMap, DomainEventName } from './events.js'
import type {
  BusLogger,
  EventBus,
  EventContext,
  EventHandler,
  Unsubscribe,
  WildcardEventHandler,
} from './event-bus.js'

/**
 * Best-effort in-process event bus. All handlers for an event run in
 * parallel; a handler that throws is logged and isolated — it does not
 * block or cancel the other handlers.
 *
 * This bus intentionally has no persistence. Handlers that need
 * durability (e.g. webhook dispatch) must read from a transactional
 * outbox table, not subscribe here.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<DomainEventName, Set<EventHandler<DomainEventName>>>()
  private readonly wildcardHandlers = new Set<WildcardEventHandler>()

  constructor (private readonly logger: BusLogger) {}

  async publish<E extends DomainEventName> (
    event: E,
    payload: DomainEventMap[E],
    ctx: EventContext,
  ): Promise<void> {
    const specific = this.handlers.get(event)
    const invocations: Promise<void>[] = []

    if (specific) {
      for (const handler of specific) {
        invocations.push(this.invoke(event, () => { return handler(payload, ctx) }))
      }
    }

    for (const handler of this.wildcardHandlers) {
      invocations.push(this.invoke(event, () => { return handler(event, payload, ctx) }))
    }

    await Promise.all(invocations)
  }

  subscribe<E extends DomainEventName> (
    event: E,
    handler: EventHandler<E>,
  ): Unsubscribe {
    let bucket = this.handlers.get(event)
    if (!bucket) {
      bucket = new Set()
      this.handlers.set(event, bucket)
    }
    // Upcast is safe: bucket only receives this handler's own event type.
    bucket.add(handler as EventHandler<DomainEventName>)
    return () => {
      bucket?.delete(handler as EventHandler<DomainEventName>)
    }
  }

  subscribeAll (handler: WildcardEventHandler): Unsubscribe {
    this.wildcardHandlers.add(handler)
    return () => {
      this.wildcardHandlers.delete(handler)
    }
  }

  private async invoke (
    event: DomainEventName,
    fn: () => void | Promise<void>,
  ): Promise<void> {
    try {
      await fn()
    } catch (err) {
      this.logger.error({ event, err }, 'event handler threw')
    }
  }
}
