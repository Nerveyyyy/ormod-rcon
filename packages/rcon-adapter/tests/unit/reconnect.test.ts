import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeBackoff,
  createReconnectSupervisor,
  DEFAULT_RECONNECT,
  type ReconnectStateAccess,
} from '../../src/client/reconnect.js'
import type { RconClientState } from '../../src/client/rcon-client.js'

describe('reconnect policy', () => {
  it('produces the base delay when jitter is zero', () => {
    const policy = { ...DEFAULT_RECONNECT, jitter: 0 }
    expect(computeBackoff(0, policy)).toBe(1_000)
    expect(computeBackoff(1, policy)).toBe(2_000)
    expect(computeBackoff(2, policy)).toBe(4_000)
    expect(computeBackoff(3, policy)).toBe(8_000)
  })

  it('clamps at maxDelayMs', () => {
    const policy = { ...DEFAULT_RECONNECT, jitter: 0 }
    expect(computeBackoff(100, policy)).toBe(policy.maxDelayMs)
    expect(computeBackoff(5, policy)).toBe(policy.maxDelayMs)
  })

  it('never returns a negative delay even at extreme jitter', () => {
    const policy = { ...DEFAULT_RECONNECT, jitter: 2 }
    // rng=0 → offset = (0*2-1) * 2 * raw = -2*raw → would go negative if not clamped
    expect(computeBackoff(0, policy, () => {
      return 0
    })).toBeGreaterThanOrEqual(0)
  })

  it('jitter is symmetric around the base delay', () => {
    const policy = { ...DEFAULT_RECONNECT, jitter: 0.2 }
    // rng=0.5 produces offset=0 (center)
    expect(computeBackoff(2, policy, () => {
      return 0.5
    })).toBe(4_000)
    // rng=0.0 → -jitter
    expect(computeBackoff(2, policy, () => {
      return 0
    })).toBe(4_000 - 800)
    // rng=0.999... → +jitter (approximately)
    const high = computeBackoff(2, policy, () => {
      return 0.999_999
    })
    expect(high).toBeGreaterThan(4_000 + 798)
    expect(high).toBeLessThanOrEqual(4_000 + 800)
  })

  it('clamps negative attempts to 0', () => {
    const policy = { ...DEFAULT_RECONNECT, jitter: 0 }
    expect(computeBackoff(-1, policy)).toBe(1_000)
    expect(computeBackoff(-100, policy)).toBe(1_000)
  })

})

const makeStore = (initial?: RconClientState): ReconnectStateAccess => {
  let state: RconClientState = initial ?? { kind: 'idle' }
  return {
    get: () => {
      return state
    },
    set: (next) => {
      state = next
    },
  }
}

describe('reconnect supervisor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves policy defaults internally and exposes the resolved policy', () => {
    const sup = createReconnectSupervisor({
      policy: undefined,
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: makeStore(),
    })
    expect(sup.policy).toEqual(DEFAULT_RECONNECT)
    sup.stop()

    const partial = createReconnectSupervisor({
      policy: { jitter: 0 },
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: makeStore(),
    })
    expect(partial.policy).toEqual({ ...DEFAULT_RECONNECT, jitter: 0 })
    partial.stop()
  })

  it('attempt starts at 0; failure() increments', () => {
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, jitter: 0 },
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: makeStore(),
    })
    expect(sup.attempt).toBe(0)
    sup.failure(new Error('first'))
    expect(sup.attempt).toBe(1)
    vi.advanceTimersByTime(60_000)
    sup.failure(new Error('second'))
    expect(sup.attempt).toBe(2)
    sup.stop()
  })

  it('success() resets attempt to 0', () => {
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, jitter: 0 },
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: makeStore(),
    })
    sup.failure(new Error('fail'))
    expect(sup.attempt).toBe(1)
    sup.success()
    expect(sup.attempt).toBe(0)
  })

  it('failure() with policy.enabled=false sets state to closed{error}', () => {
    const store = makeStore()
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, enabled: false },
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: store,
    })
    const err = new Error('disabled-fail')
    sup.failure(err)
    expect(store.get()).toEqual({
      kind: 'closed',
      reason: 'error',
      error: err,
    })
  })

  it('failure() with policy.enabled=false leaves an existing closed state alone', () => {
    const store = makeStore({ kind: 'closed', reason: 'user' })
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, enabled: false },
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: store,
    })
    sup.failure(new Error('after-close'))
    expect(store.get()).toEqual({ kind: 'closed', reason: 'user' })
  })

  it('failure() with policy.enabled=true schedules retry and sets reconnecting', () => {
    const store = makeStore()
    const onAttempt = vi.fn()
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, jitter: 0, initialDelayMs: 1_000 },
      isAborted: () => {
        return false
      },
      onAttempt,
      stateAccess: store,
    })
    const err = new Error('recoverable')
    sup.failure(err)
    const s = store.get()
    expect(s.kind).toBe('reconnecting')
    if (s.kind === 'reconnecting') {
      expect(s.attempt).toBe(1)
      expect(s.lastError).toBe(err)
    }
    expect(onAttempt).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_500)
    expect(onAttempt).toHaveBeenCalledTimes(1)
    sup.stop()
  })

  it('isAborted at timer body: returns without calling onAttempt or touching state', () => {
    const store = makeStore()
    const onAttempt = vi.fn()
    let aborted = false
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, jitter: 0 },
      isAborted: () => {
        return aborted
      },
      onAttempt,
      stateAccess: store,
    })
    sup.failure(new Error('x'))
    expect(store.get().kind).toBe('reconnecting')
    aborted = true
    // Pretend the orchestrator's abort handler set closed{user}.
    store.set({ kind: 'closed', reason: 'user' })
    vi.advanceTimersByTime(60_000)
    expect(onAttempt).not.toHaveBeenCalled()
    expect(store.get()).toEqual({ kind: 'closed', reason: 'user' })
    sup.stop()
  })

  it('isAborted at failure() time: no state change (orchestrator owns closed{user})', () => {
    const store = makeStore({ kind: 'closed', reason: 'user' })
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT },
      isAborted: () => {
        return true
      },
      onAttempt: vi.fn(),
      stateAccess: store,
    })
    sup.failure(new Error('late'))
    expect(store.get()).toEqual({ kind: 'closed', reason: 'user' })
  })

  it('stop() clears a pending retry timer', () => {
    const store = makeStore()
    const onAttempt = vi.fn()
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, jitter: 0 },
      isAborted: () => {
        return false
      },
      onAttempt,
      stateAccess: store,
    })
    sup.failure(new Error('x'))
    sup.stop()
    vi.advanceTimersByTime(60_000)
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('reconnecting.attempt increments monotonically across failures', () => {
    const store = makeStore()
    const sup = createReconnectSupervisor({
      policy: { ...DEFAULT_RECONNECT, jitter: 0 },
      isAborted: () => {
        return false
      },
      onAttempt: vi.fn(),
      stateAccess: store,
    })
    const attempts: number[] = []
    for (let i = 0; i < 4; i += 1) {
      sup.failure(new Error('x'))
      const s = store.get()
      if (s.kind === 'reconnecting') {
        attempts.push(s.attempt)
      }
      vi.advanceTimersByTime(60_000)
    }
    expect(attempts).toEqual([ 1, 2, 3, 4 ])
    sup.stop()
  })
})
