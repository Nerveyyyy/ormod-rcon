import { encodePing } from '../protocol/codec.js'
import { RconTransportError } from '../protocol/errors.js'
import type { Transport } from '../transport/ws-transport.js'

// Module-level scheduler so a process with N clients still uses one timer
// (libuv cost stays O(1) regardless of client count).

export interface KeepaliveHook {
  tick (now: number): void
}

export const KEEPALIVE_INTERVAL_MS = 30_000
export const PONG_TIMEOUT_MS = 10_000

const hooks = new Set<KeepaliveHook>()
let timer: ReturnType<typeof setInterval> | null = null

const runTick = (): void => {
  const now = Date.now()
  for (const hook of hooks) {
    try {
      hook.tick(now)
    } catch {
      // One hook's failure must not block the rest. Logging is the hook's job.
    }
  }
}

export const registerKeepalive = (hook: KeepaliveHook): (() => void) => {
  hooks.add(hook)
  if (timer === null) {
    timer = setInterval(runTick, KEEPALIVE_INTERVAL_MS)
    // unref so an idle process (no live sockets) can still exit.
    timer.unref?.()
  }
  return () => {
    hooks.delete(hook)
    if (hooks.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

export const _keepaliveHookCountForTests = (): number => {
  return hooks.size
}

export const _keepaliveTimerActiveForTests = (): boolean => {
  return timer !== null
}

// ── per-client pinger ───────────────────────────────────────────────────────
// Hook is registered with the shared scheduler only while the client is in
// the `ready` state; the orchestrator drives start()/stop() explicitly.

export interface ClientKeepaliveOptions {
  getTransport: () => Transport | null
  onFailure: (err: Error) => void
  // Test seam — production callers leave this undefined.
  pongTimeoutMs?: number
}

export interface ClientKeepalive {
  start (): void
  stop (): void
  onPong (): void
}

export const createClientKeepalive = (
  options: ClientKeepaliveOptions,
): ClientKeepalive => {
  const pongTimeoutMs = options.pongTimeoutMs ?? PONG_TIMEOUT_MS
  let unsubscribe: (() => void) | null = null
  let pingsInFlight = 0
  let lastPingSentAt = 0

  const tick = (now: number): void => {
    if (pingsInFlight > 0) {
      // A ping is outstanding. If it's overdue, the connection is wedged and
      // we hand off to onFailure. Otherwise we just wait — never send a
      // second ping while one is in flight, regardless of timing.
      if (now - lastPingSentAt > pongTimeoutMs) {
        options.onFailure(
          new RconTransportError(
            'pong not received within timeout',
            'socket_closed',
          ),
        )
      }
      return
    }
    const transport = options.getTransport()
    if (transport === null) {
      return
    }
    try {
      // Lifecycle frame — bypasses flow-control intentionally.
      transport.send(encodePing())
      lastPingSentAt = now
      // Assignment, not += 1: the early return above guarantees we were at 0.
      pingsInFlight = 1
    } catch (err) {
      options.onFailure(
        err instanceof Error
          ? err
          : new RconTransportError('failed to send ping', 'socket_closed'),
      )
    }
  }

  const hook: KeepaliveHook = { tick }

  return {
    start: () => {
      if (unsubscribe !== null) {
        return
      }
      pingsInFlight = 0
      lastPingSentAt = 0
      unsubscribe = registerKeepalive(hook)
    },
    stop: () => {
      if (unsubscribe === null) {
        return
      }
      unsubscribe()
      unsubscribe = null
      pingsInFlight = 0
      lastPingSentAt = 0
    },
    onPong: () => {
      pingsInFlight = 0
    },
  }
}
