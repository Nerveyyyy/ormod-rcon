import type { RconClientState } from './rcon-client.js'

// Minimal state surface the supervisor needs — read current kind to avoid
// double-set, write reconnecting / closed{error}. Defined locally so this
// module isn't coupled to the full event-emitter surface of the client.
export interface ReconnectStateAccess {
  get (): RconClientState
  set (next: RconClientState): void
}

// Jitter prevents N clients from re-dialing in lockstep after a shared
// upstream event. Default ±20% turns a thundering herd into a spread curve.

export interface ReconnectPolicy {
  initialDelayMs: number
  maxDelayMs: number
  jitter: number
  enabled: boolean
}

export const DEFAULT_RECONNECT: ReconnectPolicy = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitter: 0.2,
  enabled: true,
}

const resolvePolicy = (
  partial: Partial<ReconnectPolicy> | undefined,
): ReconnectPolicy => {
  return {
    initialDelayMs: partial?.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs,
    maxDelayMs: partial?.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs,
    jitter: partial?.jitter ?? DEFAULT_RECONNECT.jitter,
    enabled: partial?.enabled ?? DEFAULT_RECONNECT.enabled,
  }
}

// `attempt` is 0-indexed (0 = first retry after a failure). rng is injected
// so tests can pin it.
export const computeBackoff = (
  attempt: number,
  policy: ReconnectPolicy = DEFAULT_RECONNECT,
  rng: () => number = Math.random,
): number => {
  const clampedAttempt = Math.max(0, attempt)
  const raw = Math.min(
    policy.initialDelayMs * Math.pow(2, clampedAttempt),
    policy.maxDelayMs,
  )
  const jitterRange = raw * policy.jitter
  const offset = (rng() * 2 - 1) * jitterRange
  return Math.max(0, Math.round(raw + offset))
}

// ── supervisor ──────────────────────────────────────────────────────────────
// Owns the attempt counter, the retry timer, and the `reconnecting` and
// `closed{reason:'error'}` state transitions. Does NOT own user-aborted
// shutdown — the orchestrator's abort/close handlers set `closed{reason:'user'}`
// and call stop() to clear the timer. The supervisor's timer body, on abort
// detection, simply returns without touching state.

export interface ReconnectSupervisorOptions {
  policy?: Partial<ReconnectPolicy>
  isAborted: () => boolean
  onAttempt: () => void
  stateAccess: ReconnectStateAccess
  // Test seam — production callers leave this undefined.
  rng?: () => number
}

export interface ReconnectSupervisor {
  success (): void
  failure (err: Error): void
  stop (): void
  readonly attempt: number
  readonly policy: ReconnectPolicy
}

export const createReconnectSupervisor = (
  options: ReconnectSupervisorOptions,
): ReconnectSupervisor => {
  const { isAborted, onAttempt, stateAccess } = options
  const policy = resolvePolicy(options.policy)
  const rng = options.rng ?? Math.random
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    success: () => {
      attempt = 0
      clearTimer()
    },
    failure: (err) => {
      clearTimer()
      if (!policy.enabled) {
        if (stateAccess.get().kind !== 'closed') {
          stateAccess.set({ kind: 'closed', reason: 'error', error: err })
        }
        return
      }
      if (isAborted()) {
        // Orchestrator's abort handler already set closed{user}; don't
        // overwrite that with closed{error}.
        return
      }
      // Increment after computing delay so attempt 0 → initial delay, then
      // attempt becomes 1 in the reconnecting/connecting state for visibility.
      const delay = computeBackoff(attempt, policy, rng)
      attempt += 1
      const nextAttemptAt = Date.now() + delay
      stateAccess.set({
        kind: 'reconnecting',
        nextAttemptAt,
        attempt,
        lastError: err,
      })
      timer = setTimeout(() => {
        timer = null
        if (isAborted()) {
          // Aborted between scheduling and firing. Orchestrator's abort
          // handler already moved state to closed{user} — just bail.
          return
        }
        onAttempt()
      }, delay)
    },
    stop: () => {
      clearTimer()
    },
    get attempt () {
      return attempt
    },
    get policy () {
      return policy
    },
  }
}
