import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createClientKeepalive,
  registerKeepalive,
  _keepaliveHookCountForTests,
  _keepaliveTimerActiveForTests,
  KEEPALIVE_INTERVAL_MS,
} from '../../src/client/keepalive.js'
import { RconTransportError } from '../../src/protocol/errors.js'
import type { Transport } from '../../src/transport/ws-transport.js'

// The scheduler is a module-level singleton. Each test registers then
// un-registers its hooks to keep state clean across cases.
const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) {
    const off = cleanups.pop()
    off?.()
  }
  vi.useRealTimers()
})

describe('keepalive scheduler', () => {
  it('register adds a hook and returns an unsubscribe', () => {
    expect(_keepaliveHookCountForTests()).toBe(0)
    const off = registerKeepalive({ tick: () => {} })
    expect(_keepaliveHookCountForTests()).toBe(1)
    off()
    expect(_keepaliveHookCountForTests()).toBe(0)
  })

  it('shares a single timer across hooks', () => {
    expect(_keepaliveTimerActiveForTests()).toBe(false)
    cleanups.push(registerKeepalive({ tick: () => {} }))
    cleanups.push(registerKeepalive({ tick: () => {} }))
    cleanups.push(registerKeepalive({ tick: () => {} }))
    expect(_keepaliveTimerActiveForTests()).toBe(true)
  })

  it('clears the timer when the last hook unregisters', () => {
    const off1 = registerKeepalive({ tick: () => {} })
    const off2 = registerKeepalive({ tick: () => {} })
    off1()
    expect(_keepaliveTimerActiveForTests()).toBe(true)
    off2()
    expect(_keepaliveTimerActiveForTests()).toBe(false)
  })

  it('fires all hooks every interval', () => {
    vi.useFakeTimers()
    const a = vi.fn()
    const b = vi.fn()
    cleanups.push(registerKeepalive({ tick: a }))
    cleanups.push(registerKeepalive({ tick: b }))
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 2)
    expect(a).toHaveBeenCalledTimes(3)
    expect(b).toHaveBeenCalledTimes(3)
  })

  it('isolates hook failures', () => {
    vi.useFakeTimers()
    const survivor = vi.fn()
    cleanups.push(
      registerKeepalive({
        tick: () => {
          throw new Error('boom')
        },
      }),
    )
    cleanups.push(registerKeepalive({ tick: survivor }))
    expect(() => {
      return vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    }).not.toThrow()
    expect(survivor).toHaveBeenCalledTimes(1)
  })
})

interface StubTransport extends Transport {
  sent: string[]
  shouldThrow: Error | null
}

const makeStubTransport = (): StubTransport => {
  const stub: StubTransport = {
    connect: () => {
      return Promise.resolve()
    },
    send: (data: string) => {
      if (stub.shouldThrow !== null) {
        throw stub.shouldThrow
      }
      stub.sent.push(data)
    },
    close: () => {},
    get bufferedAmount () {
      return 0
    },
    get writableLength () {
      return 0
    },
    get tlsSession () {
      return undefined
    },
    sent: [],
    shouldThrow: null,
  }
  return stub
}

describe('per-client keepalive', () => {
  it('start() registers a hook with the shared scheduler; stop() unregisters', () => {
    expect(_keepaliveHookCountForTests()).toBe(0)
    const transport = makeStubTransport()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure: () => {},
    })
    ka.start()
    expect(_keepaliveHookCountForTests()).toBe(1)
    ka.stop()
    expect(_keepaliveHookCountForTests()).toBe(0)
  })

  it('start() is idempotent', () => {
    const transport = makeStubTransport()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure: () => {},
    })
    ka.start()
    ka.start()
    expect(_keepaliveHookCountForTests()).toBe(1)
    ka.stop()
    ka.stop()
    expect(_keepaliveHookCountForTests()).toBe(0)
  })

  it('sends a ping after KEEPALIVE_INTERVAL_MS', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure: vi.fn(),
    })
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    expect(transport.sent).toEqual([])
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
    expect(JSON.parse(transport.sent[0]!)).toEqual({ type: 'ping' })
  })

  it('after onPong(): next interval sends another ping', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure: vi.fn(),
    })
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
    ka.onPong()
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(2)
  })

  it('does not send a second ping while one is in flight (not overdue)', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    const onFailure = vi.fn()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure,
      // Pong timeout greater than KEEPALIVE_INTERVAL_MS so a missed pong at
      // the next tick is "in flight, not overdue" — never sends a 2nd ping.
      pongTimeoutMs: KEEPALIVE_INTERVAL_MS * 2,
    })
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
    // No onPong() — pingsInFlight stays > 0. Next tick at +30s, only 30s
    // elapsed since the ping; pongTimeoutMs is 60s, so not overdue.
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('onFailure fires with a typed transport error when pong is overdue', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    const onFailure = vi.fn()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure,
    })
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
    // No onPong; default PONG_TIMEOUT_MS is 10s; the next tick fires 30s
    // after the ping — overdue.
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(onFailure).toHaveBeenCalledTimes(1)
    const err = onFailure.mock.calls[0]?.[0]
    expect(err).toBeInstanceOf(RconTransportError)
    expect((err as RconTransportError).code).toBe('socket_closed')
    expect((err as RconTransportError).message).toMatch(/pong/i)
    // No new ping after overdue.
    expect(transport.sent).toHaveLength(1)
  })

  it('tick is a no-op when getTransport() returns null', () => {
    vi.useFakeTimers()
    let transport: StubTransport | null = null
    const onFailure = vi.fn()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure,
    })
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(onFailure).not.toHaveBeenCalled()
    transport = makeStubTransport()
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
  })

  it('onFailure fires when transport.send() throws synchronously', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    transport.shouldThrow = new Error('socket dead')
    const onFailure = vi.fn()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure,
    })
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(onFailure).toHaveBeenCalledTimes(1)
    const err = onFailure.mock.calls[0]?.[0]
    expect((err as Error).message).toBe('socket dead')
  })

  it('stop() prevents further ticks', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure: vi.fn(),
    })
    ka.start()
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(1)
    ka.stop()
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 5)
    expect(transport.sent).toHaveLength(1)
  })

  it('start() after stop() resets counters and resumes pings', () => {
    vi.useFakeTimers()
    const transport = makeStubTransport()
    const ka = createClientKeepalive({
      getTransport: () => {
        return transport
      },
      onFailure: vi.fn(),
    })
    ka.start()
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    // pingsInFlight is 1; if stop did not reset, the next start's first tick
    // would think a ping is in flight from the previous lifecycle.
    ka.stop()
    ka.start()
    cleanups.push(() => {
      return ka.stop()
    })
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS)
    expect(transport.sent).toHaveLength(2)
  })
})
