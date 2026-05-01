import { describe, it, expect, vi } from 'vitest'
import { createAuthenticator } from '../../src/client/authenticator.js'
import {
  RconClient,
  RconProtocolError,
  RconTransportError,
} from '../../src/index.js'
import { createFakeTransportRegistry } from '../helpers/fake-transport.js'
import type { Transport } from '../../src/transport/ws-transport.js'

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

const SAMPLE_INFO = {
  serverTime: '2026-04-27T00:00:00Z',
  serverName: 'Test',
  version: '1.0.0',
}

// Yields a macrotask so awaiting orchestrator paths get a chance to run
// past their next suspension point. setImmediate runs after the current
// microtask queue drains, which is what we want between simulate* steps.
const settle = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    return setImmediate(resolve)
  })
}

describe('authenticator', () => {
  it('run() resolves with auth info on handleAuthOk', async () => {
    const auth = createAuthenticator({ secret: 'ok', url: 'ws://test' })
    const transport = makeStubTransport()
    const promise = auth.run(transport)
    auth.handleAuthOk(SAMPLE_INFO)
    await expect(promise).resolves.toEqual(SAMPLE_INFO)
  })

  it('sends an auth frame to the transport', async () => {
    const auth = createAuthenticator({ secret: 'sekret', url: 'ws://test' })
    const transport = makeStubTransport()
    const p = auth.run(transport)
    auth.handleAuthOk(SAMPLE_INFO)
    await p
    expect(transport.sent).toHaveLength(1)
    expect(JSON.parse(transport.sent[0]!)).toEqual({
      type: 'auth',
      secret: 'sekret',
    })
  })

  it('handleAuthError(spec reason) → RconProtocolError preserving the code', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p = auth.run(makeStubTransport())
    auth.handleAuthError('invalid_secret')
    await expect(p).rejects.toBeInstanceOf(RconProtocolError)
    await expect(p).rejects.toMatchObject({ code: 'invalid_secret' })
  })

  it.each([ 'already_authenticated', 'max_connections' ] as const)(
    'handleAuthError(%s) → RconProtocolError(code: %s)',
    async (reason) => {
      const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
      const p = auth.run(makeStubTransport())
      auth.handleAuthError(reason)
      await expect(p).rejects.toMatchObject({ code: reason })
    },
  )

  it('handleAuthError(non-spec reason) → RconProtocolError(invalid_secret) with raw reason in message', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p = auth.run(makeStubTransport())
    auth.handleAuthError('totally_made_up_reason')
    await expect(p).rejects.toBeInstanceOf(RconProtocolError)
    await expect(p).rejects.toMatchObject({ code: 'invalid_secret' })
    await expect(p).rejects.toThrow(/totally_made_up_reason/)
  })

  it('reply timeout fires RconTransportError(socket_closed)', async () => {
    vi.useFakeTimers()
    const auth = createAuthenticator({
      secret: 'x',
      url: 'ws://test',
      replyTimeoutMs: 100,
    })
    const p = auth.run(makeStubTransport())
    p.catch(() => {})
    vi.advanceTimersByTime(150)
    await expect(p).rejects.toBeInstanceOf(RconTransportError)
    await expect(p).rejects.toMatchObject({ code: 'socket_closed' })
    vi.useRealTimers()
  })

  it('cancel() before settle rejects with an aborted-shaped error', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p = auth.run(makeStubTransport())
    auth.cancel()
    await expect(p).rejects.toMatchObject({ message: /canceled/i })
  })

  it('cancel() after settle is a no-op', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p = auth.run(makeStubTransport())
    auth.handleAuthOk(SAMPLE_INFO)
    await p
    expect(() => {
      return auth.cancel()
    }).not.toThrow()
  })

  it('handleAuthOk after cancel() is a no-op (idempotent settle)', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p = auth.run(makeStubTransport())
    p.catch(() => {})
    auth.cancel()
    expect(() => {
      return auth.handleAuthOk(SAMPLE_INFO)
    }).not.toThrow()
    await expect(p).rejects.toMatchObject({ message: /canceled/i })
  })

  it('handleAuthError after settle is a no-op', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p = auth.run(makeStubTransport())
    auth.handleAuthOk(SAMPLE_INFO)
    await p
    expect(() => {
      return auth.handleAuthError('invalid_secret')
    }).not.toThrow()
  })

  it('synchronous send-throw in run() settles the deferred via the same path', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const transport = makeStubTransport()
    transport.shouldThrow = new Error('socket dead before send')
    const p = auth.run(transport)
    await expect(p).rejects.toMatchObject({
      message: 'socket dead before send',
    })
  })

  it('run() called twice without settle rejects the second call', async () => {
    const auth = createAuthenticator({ secret: 'x', url: 'ws://test' })
    const p1 = auth.run(makeStubTransport())
    p1.catch(() => {})
    const p2 = auth.run(makeStubTransport())
    await expect(p2).rejects.toMatchObject({
      message: /already in progress/,
    })
    auth.cancel()
    await expect(p1).rejects.toMatchObject({ message: /canceled/i })
  })
})

// Regression: synchronous-onClose race during fatal auth failure. Before the
// fix, `transport.close()` could ricochet through onClose into
// handleConnectionLost while state was still 'authenticating', scheduling a
// reconnect. After the fix, state is set to 'closed{auth_failed}' BEFORE
// transport.close() so the close-state guard catches the ricochet.
describe('orchestrator: auth_error fatal close ordering', () => {
  it('does NOT trigger a reconnect after auth_error (sync-onClose race)', async () => {
    const reg = createFakeTransportRegistry()
    const transitions: string[] = []
    const client = new RconClient({
      url: 'ws://test',
      secret: 'wrong',
      // CRITICAL: reconnect ENABLED so a buggy ordering would observably
      // schedule a retry. Auth errors must remain fatal regardless.
      reconnect: {
        enabled: true,
        initialDelayMs: 1,
        maxDelayMs: 2,
        jitter: 0,
      },
      transportFactory: reg.factory,
    })
    client.on('state', (s) => {
      transitions.push(s.kind)
    })

    const connectPromise = client.connect()
    connectPromise.catch(() => {})

    // Let attemptConnect reach `await t.connect()`.
    await settle()

    const ctrl = reg.latest()
    ctrl.transport.simulateOpen()

    // Let attemptConnect reach `await authenticator.run(t)`.
    await settle()

    // Server replies auth_error. The handler will:
    //   - publishAuth(error)
    //   - settle the auth deferred with RconProtocolError
    //   - attemptConnect's catch → closeFatalAuthFailure
    //   - closeFatalAuthFailure sets state=closed BEFORE t.close()
    //   - t.close() synchronously fires onClose; the closed-state guard bails
    ctrl.transport.simulateMessage(JSON.stringify({
      type: 'auth_error',
      reason: 'invalid_secret',
    }))

    await expect(connectPromise).rejects.toBeInstanceOf(RconProtocolError)
    await expect(connectPromise).rejects.toMatchObject({
      code: 'invalid_secret',
    })

    expect(client.state.kind).toBe('closed')
    if (client.state.kind === 'closed') {
      expect(client.state.reason).toBe('auth_failed')
    }

    // Wait past the initialDelayMs window (real timers). If the race were
    // present, a reconnect attempt timer would fire and we'd see
    // 'reconnecting' in transitions.
    await new Promise<void>((r) => {
      return setTimeout(r, 50)
    })

    expect(transitions).not.toContain('reconnecting')
    expect(transitions).toContain('connecting')
    expect(transitions).toContain('authenticating')
    expect(transitions).toContain('closed')
  })
})
