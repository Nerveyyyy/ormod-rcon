import { eq } from 'drizzle-orm'
import type { DbClient, SecretEncrypter } from '@ormod/database'
import { servers as serversTable } from '@ormod/database'
import type { EventBus, LastErrorReasonCode } from '@ormod/eventing'
import {
  RconClient,
  type RconClientState,
} from '@ormod/rcon-adapter'
import type { AppLogger } from '../lib/logger.js'
import { buildRconUrl } from '../lib/rcon-url.js'

export type RconConnectionState = 'connecting' | 'connected' | 'disconnected' | 'errored'

export interface RconStatus {
  serverId: string
  state: RconConnectionState
  playerCount: number | null
  latencyMs: number | null
  lastConnectedAt: Date | null
  lastErrorReason: LastErrorReasonCode | null
}

export interface RconSupervisor {
  start (): Promise<void>
  stop (): Promise<void>
  add (serverId: string): Promise<void>
  remove (serverId: string): Promise<void>
  getStatus (serverId: string): RconStatus | null
}

export interface CreateSupervisorDeps {
  logger: AppLogger
  db: DbClient
  bus: EventBus
  encrypter: SecretEncrypter
}

interface Slot {
  serverId: string
  tenantId: string
  client: RconClient
  unsubscribe: () => void
  status: RconStatus
  /** Wallclock of the first failure since the last successful connect.
   * `null` when the slot is healthy. */
  firstFailureAt: number | null
  /** Re-entry guard so the auto-disable path runs at most once per slot. */
  disabling: boolean
  /** Per-slot publish chain. Every status publish links onto this so writes
   * for a single server land in order. Without this, two consecutive
   * transitions would fire `void bus.publish(...)` concurrently and the
   * runtime-subscriber's async DB upserts would race — the older write
   * could resolve last and clobber the newer state. */
  publishChain: Promise<void>
}

/** Reconnect cap for the adapter — at most one attempt per minute. */
const RECONNECT_MAX_DELAY_MS = 60_000

/** After this much continuous failure, override the dashboard state to
 * `errored` so the badge stops spinning forever. Reconnects continue
 * silently — this is purely a UI signal. Short threshold so the
 * operator notices something is wrong quickly. */
const ERRORED_AFTER_MS = 30 * 1000 // 30 seconds

/** After this much continuous failure, give up: tear down the client
 * and flip `enabled=false` in the DB so the operator has to re-enable
 * the server explicitly. Stops indefinite network attempts on a server
 * that's almost certainly dead. */
const DISABLE_AFTER_MS = 24 * 60 * 60 * 1000 // 24 hours

const mapStateKind = (kind: RconClientState['kind']): RconConnectionState => {
  switch (kind) {
    case 'ready':
      return 'connected'
    case 'idle':
    case 'connecting':
    case 'authenticating':
    case 'reconnecting':
      return 'connecting'
    case 'closing':
    case 'closed':
      return 'disconnected'
  }
}

/**
 * Maps the adapter state plus failure history to a typed reason code so
 * the dashboard can render localised copy without parsing free-text. The
 * code is independent of the dashboard's `connection_state` — both are
 * carried in the bus payload and persisted side by side.
 */
const computeReasonCode = (
  next: RconClientState,
  hadPriorConnection: boolean,
  failureMs: number,
): LastErrorReasonCode | null => {
  if (next.kind === 'closed' && next.reason === 'auth_failed') {
    return 'auth_failed'
  }
  // Healthy or operator-driven shutdown — no error to surface.
  if (next.kind === 'ready' || next.kind === 'idle') {
    return null
  }
  if (next.kind === 'closing') {
    return null
  }
  if (next.kind === 'closed' && next.reason === 'user') {
    return null
  }
  // The remainder are failure modes (reconnecting, connecting/authenticating
  // during a failure window, closed{error}, closed{giveup}).
  if (failureMs >= ERRORED_AFTER_MS) {
    return 'unreachable_after_30s'
  }
  return hadPriorConnection ? 'connection_lost' : 'initial_connect_failed'
}

/**
 * Lifecycle owner for the pool of per-server RCON WebSocket connections.
 *
 * On start(): loads every enabled server row, decrypts its RCON
 * password, and opens one `RconClient` per server. Transitions each
 * client's state through the bus as `server.status` — a downstream
 * subscriber upserts `server_runtime`.
 *
 * Routes call add()/remove() on create and delete so the live pool
 * tracks the database without a polling loop or a notify channel. Both
 * operations are idempotent.
 *
 * Failure handling has two thresholds: after `ERRORED_AFTER_MS` of
 * continuous reconnect failures the dashboard state is overridden to
 * `errored` (UI signal); after `DISABLE_AFTER_MS` the server is
 * tear-down + marked `enabled=false` so we stop trying.
 */
export const createRconSupervisor = (deps: CreateSupervisorDeps): RconSupervisor => {
  const log = deps.logger.child({ component: 'rcon-supervisor' })
  const slots = new Map<string, Slot>()

  // Serialised per-slot status publish. The bus's publish() awaits all
  // handlers per call, but consecutive publishes don't wait for each other
  // unless the caller chains them. publishChain enforces that ordering so
  // the runtime-subscriber sees writes in the order this supervisor
  // observed them.
  const publishStatus = (slot: Slot): void => {
    const payload = {
      serverId: slot.serverId,
      state: slot.status.state,
      playerCount: slot.status.playerCount,
      lastErrorReason: slot.status.lastErrorReason,
      at: new Date(),
    }
    const ctx = { tenantId: slot.tenantId, serverId: slot.serverId }
    slot.publishChain = slot.publishChain
      // Swallow chain failures so a single bad publish doesn't poison
      // every subsequent one.
      .catch(() => {
        return undefined
      })
      .then(() => {
        return deps.bus.publish('server.status', payload, ctx)
      })
  }

  const autoDisable = async (
    slot: Slot,
    cause: { reason: LastErrorReasonCode; failureMs?: number; logMessage: string },
  ): Promise<void> => {
    if (slot.disabling) return
    slot.disabling = true
    log.warn(
      { serverId: slot.serverId, reason: cause.reason, failureMs: cause.failureMs },
      cause.logMessage,
    )
    try {
      await deps.db
        .update(serversTable)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(serversTable.id, slot.serverId))
    } catch (err) {
      log.error(
        { err, serverId: slot.serverId },
        '[supervisor] failed to mark server disabled in DB',
      )
    }
    // Tear down the client without triggering closeSlot's disconnected
    // publish — the final state we want on the bus is `errored` plus the
    // typed reason code so the dashboard explains why the server is no
    // longer being supervised.
    slot.unsubscribe()
    slots.delete(slot.serverId)
    try {
      await slot.client.close()
    } catch (err) {
      log.warn(
        { err, serverId: slot.serverId },
        '[supervisor] close threw during auto-disable',
      )
    }
    slot.status = {
      ...slot.status,
      state: 'errored',
      lastErrorReason: cause.reason,
    }
    publishStatus(slot)
    // Block until the final publish lands in the DB so callers (HTTP
    // handlers, shutdown) observe the terminal state.
    await slot.publishChain
  }

  const openSlot = (row: {
    id: string
    tenantId: string
    rconHost: string
    rconPort: number
    rconPasswordEncrypted: string
  }): void => {
    if (slots.has(row.id)) {
      return
    }
    let secret: string
    try {
      secret = deps.encrypter.decryptTenantScoped(
        row.tenantId,
        row.rconPasswordEncrypted,
      )
    } catch (err) {
      log.error({ err, serverId: row.id }, '[supervisor] rcon password decrypt failed')
      return
    }

    const status: RconStatus = {
      serverId: row.id,
      state: 'connecting',
      playerCount: null,
      latencyMs: null,
      lastConnectedAt: null,
      lastErrorReason: null,
    }

    // Event ingestion lands in a later phase — no 'gameEvent' listener
    // wired here yet. The supervisor's current job is limited to
    // connection-state bookkeeping via the 'state' event.
    const client = new RconClient({
      url: buildRconUrl(row.rconHost, row.rconPort),
      secret,
      logger: deps.logger,
      reconnect: { maxDelayMs: RECONNECT_MAX_DELAY_MS },
    })

    const slot: Slot = {
      serverId: row.id,
      tenantId: row.tenantId,
      client,
      unsubscribe: () => {},
      status,
      firstFailureAt: null,
      disabling: false,
      publishChain: Promise.resolve(),
    }

    log.info(
      { serverId: row.id, host: row.rconHost, port: row.rconPort },
      '[supervisor] dialling',
    )

    const onState = (next: RconClientState): void => {
      if (slot.disabling) return // ignore late events after auto-disable

      // Auth failure is terminal and not self-correcting — wrong password
      // doesn't fix itself across reconnects or restarts. Tear down
      // immediately, mark the server disabled, and surface a clear reason.
      if (next.kind === 'closed' && next.reason === 'auth_failed') {
        void autoDisable(slot, {
          reason: 'auth_failed',
          logMessage: '[supervisor] auth failed — disabling server',
        })
        return
      }

      const previous = slot.status.state
      const now = Date.now()
      const hadPriorConnection = slot.status.lastConnectedAt !== null

      // Track the failure window. A successful `ready` clears it;
      // anything else (reconnecting, closed/error) opens or extends it.
      if (next.kind === 'ready') {
        slot.firstFailureAt = null
      } else if (next.kind === 'reconnecting' || next.kind === 'closed') {
        if (slot.firstFailureAt === null) slot.firstFailureAt = now
      }

      const failureMs = slot.firstFailureAt !== null ? now - slot.firstFailureAt : 0

      // Threshold 2 (24h): give up entirely. Schedule the async disable
      // path; the guard at the top of this callback prevents re-entry
      // for any late events that arrive while the close is in flight.
      if (failureMs >= DISABLE_AFTER_MS) {
        void autoDisable(slot, {
          reason: 'disabled_after_24h',
          failureMs,
          logMessage: '[supervisor] auto-disabling after 24h of continuous failure',
        })
        return
      }

      let nextState = mapStateKind(next.kind)
      const reason = computeReasonCode(next, hadPriorConnection, failureMs)

      // Threshold 1 (30s): override mapped state to `errored` so the
      // dashboard stops showing "connecting" forever. We still keep
      // trying — the adapter's reconnect loop is unchanged.
      if (failureMs >= ERRORED_AFTER_MS && nextState === 'connecting') {
        nextState = 'errored'
      }
      // closed{error} arrives only when reconnect is disabled; we set
      // reconnect.enabled=true so this is effectively unreachable, but
      // keep the override so the supervisor still surfaces 'errored' if
      // a future config flips it.
      if (next.kind === 'closed' && next.reason === 'error') {
        nextState = 'errored'
      }

      slot.status = {
        ...slot.status,
        state: nextState,
        lastErrorReason: reason,
      }
      if (next.kind === 'ready') {
        slot.status = { ...slot.status, lastConnectedAt: new Date() }
      }

      // Log directly off the adapter's events instead of the mapped
      // state, so a connect-fail loop is visible. Exponential backoff
      // self-rate-limits the reconnect log lines (capped at 1/min).
      if (next.kind === 'ready' && previous !== 'connected') {
        log.info({ serverId: row.id }, '[supervisor] connected')
      } else if (next.kind === 'reconnecting') {
        log.warn(
          {
            serverId: row.id,
            attempt: next.attempt,
            nextAttemptAt: new Date(next.nextAttemptAt).toISOString(),
            lastError: next.lastError.message,
          },
          '[supervisor] reconnect scheduled',
        )
      } else if (next.kind === 'closed') {
        if (nextState === 'errored') {
          log.warn({ serverId: row.id, reason }, '[supervisor] errored')
        } else if (previous !== 'disconnected') {
          log.info({ serverId: row.id, reason }, '[supervisor] disconnected')
        }
      }

      publishStatus(slot)
    }
    client.on('state', onState)
    slot.unsubscribe = () => {
      client.off('state', onState)
    }

    slots.set(row.id, slot)
    // Emit the initial 'connecting' so runtime rows appear before auth
    // completes. The 'state' listener will take over from here.
    publishStatus(slot)

    // Fire-and-forget. `client.connect()` returns a promise that only
    // resolves when the state hits `ready` — for an unreachable server
    // with reconnect enabled (the default) the promise NEVER resolves.
    // Awaiting it would block supervisor.start(), which blocks the
    // bootstrap, which means app.listen() never runs and the rest of
    // the API never comes up. The state machine via the 'state' listener
    // gives us everything we need without the await.
    void client.connect().catch((err) => {
      log.debug(
        { err, serverId: row.id },
        '[supervisor] initial connect rejected; reconnect loop will retry',
      )
    })
  }

  const closeSlot = async (serverId: string): Promise<void> => {
    const slot = slots.get(serverId)
    if (!slot) return
    slot.unsubscribe()
    slots.delete(serverId)
    try {
      await slot.client.close()
    } catch (err) {
      log.warn({ err, serverId }, '[supervisor] rcon close threw')
    }
    // Operator-initiated shutdown is not an error — clear the reason so
    // the dashboard doesn't show stale failure copy after the operator
    // explicitly removed the server.
    slot.status = {
      ...slot.status,
      state: 'disconnected',
      lastErrorReason: null,
    }
    publishStatus(slot)
    // Block until the disconnected publish lands so the DB is consistent
    // with the supervisor's view by the time we return. Without this, the
    // caller (DELETE handler, shutdown sequence) could observe the slot
    // gone while the runtime row still says 'connected'.
    await slot.publishChain
  }

  const loadServer = async (serverId: string): Promise<Slot['status'] | null> => {
    const rows = await deps.db
      .select({
        id: serversTable.id,
        tenantId: serversTable.tenantId,
        rconHost: serversTable.rconHost,
        rconPort: serversTable.rconPort,
        rconPasswordEncrypted: serversTable.rconPasswordEncrypted,
        enabled: serversTable.enabled,
      })
      .from(serversTable)
      .where(eq(serversTable.id, serverId))
      .limit(1)
    const row = rows[0]
    if (!row || !row.enabled) {
      return null
    }
    openSlot(row)
    return slots.get(serverId)?.status ?? null
  }

  return {
    start: async () => {
      const rows = await deps.db
        .select({
          id: serversTable.id,
          tenantId: serversTable.tenantId,
          rconHost: serversTable.rconHost,
          rconPort: serversTable.rconPort,
          rconPasswordEncrypted: serversTable.rconPasswordEncrypted,
        })
        .from(serversTable)
        .where(eq(serversTable.enabled, true))
      for (const row of rows) {
        openSlot(row)
      }
      log.info({ count: rows.length }, '[supervisor] started')
    },

    stop: async () => {
      // closeSlot is independent per slot; sequential awaits would compound
      // shutdown time linearly with the slot count. Parallel is safe — no
      // shared state between slots beyond the `slots` map, and closeSlot
      // mutates only its own entry.
      const ids = Array.from(slots.keys())
      await Promise.all(ids.map(closeSlot))
      log.info('[supervisor] stopped')
    },

    add: async (serverId) => {
      await loadServer(serverId)
    },

    remove: async (serverId) => {
      await closeSlot(serverId)
    },

    getStatus: (serverId) => {
      return slots.get(serverId)?.status ?? null
    },
  }
}