import { sql } from 'drizzle-orm'
import type { DbClient } from '@ormod/database'
import { serverRuntime } from '@ormod/database'
import type { EventBus, Unsubscribe } from '@ormod/eventing'
import { isTransientDbError } from '../lib/db-errors.js'
import type { AppLogger } from '../lib/logger.js'

export interface RuntimeSubscriberDeps {
  logger: AppLogger
  bus: EventBus
  db: DbClient
}

/**
 * Persists every `server.status` publish to the `server_runtime` row for
 * that server. The supervisor owns the state transitions; this
 * subscriber owns the durability. Kept separate so the two concerns
 * can be tested independently and so a future projection layer can
 * subscribe without racing the supervisor.
 */
export const registerRuntimeSubscriber = (deps: RuntimeSubscriberDeps): Unsubscribe => {
  return deps.bus.subscribe('server.status', async (payload, ctx) => {
    const now = new Date()
    const lastConnectedAt = payload.state === 'connected' ? now : null
    const lastDisconnectedAt =
      payload.state === 'disconnected' || payload.state === 'errored' ? now : null

    try {
      await deps.db
        .insert(serverRuntime)
        .values({
          serverId: payload.serverId,
          tenantId: ctx.tenantId,
          connectionState: payload.state,
          playerCount: payload.playerCount,
          latencyMs: null,
          lastConnectedAt,
          lastDisconnectedAt,
          lastErrorReason: payload.lastErrorReason,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: serverRuntime.serverId,
          set: {
            connectionState: payload.state,
            playerCount: payload.playerCount,
            lastConnectedAt: lastConnectedAt
              ? lastConnectedAt
              : sql`${ serverRuntime.lastConnectedAt }`,
            lastDisconnectedAt: lastDisconnectedAt
              ? lastDisconnectedAt
              : sql`${ serverRuntime.lastDisconnectedAt }`,
            lastErrorReason: payload.lastErrorReason,
            updatedAt: now,
          },
        })
    } catch (err) {
      // Connection-class failures (DB temporarily unreachable, socket
      // reset by the kernel, postgres-js pool reconnecting) are
      // operational and noisy at error level — the pool recovers on
      // its own. Real failures (constraints, schema, etc.) still land
      // at error with the stack.
      if (isTransientDbError(err)) {
        deps.logger.warn(
          {
            serverId: payload.serverId,
            state: payload.state,
            reason: (err as { message?: string }).message,
          },
          '[runtime] db unreachable; runtime write skipped',
        )
      } else {
        deps.logger.error(
          { err, serverId: payload.serverId, state: payload.state },
          '[runtime] failed to persist server_runtime',
        )
      }
    }
  })
}
