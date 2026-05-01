import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFakeServer, type FakeServer } from '../helpers/fake-server.js'
import { waitForCondition } from '../helpers/wait-for.js'
import {
  RconClient,
  type RconClientState,
  type RconEvent,
} from '../../src/index.js'
import { EventEmitter } from 'node:events'

/**
 * Tests for the EventEmitter public surface introduced when createRconClient
 * was replaced by the RconClient class. Covers idiomatic on/off/once usage,
 * Symbol.asyncDispose, the no-'error'-event invariant, and the listener-
 * isolation override on emit.
 */
describe('rcon-adapter · EventEmitter surface', () => {
  let server: FakeServer
  let client: RconClient | null = null

  beforeEach(async () => {
    server = await createFakeServer({ secret: 'ok' })
  })

  afterEach(async () => {
    await client?.close()
    client = null
    await server.close()
  })

  it('on(state) fires for every transition; off(state) removes the listener', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })

    const seen: string[] = []
    const onState = (s: RconClientState): void => {
      seen.push(s.kind)
    }
    client.on('state', onState)

    await client.connect()
    expect(seen).toContain('connecting')
    expect(seen).toContain('authenticating')
    expect(seen).toContain('ready')

    client.off('state', onState)
    const before = seen.length
    await client.close()
    // After off(), no further entries should land for this listener.
    expect(seen.length).toBe(before)
  })

  it('on(gameEvent) fires for inbound event frames', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })

    const events: RconEvent[] = []
    client.on('gameEvent', (e) => {
      events.push(e)
    })
    await client.connect()

    server.sendEvent({
      name: 'player.join',
      steamId: '76561198001234567',
      displayName: 'EmitterTester',
      ip: '203.0.113.1',
    })

    await waitForCondition(() => {
      return events.length >= 1
    }, 'first gameEvent delivered')
    expect(events[0]?.name).toBe('player.join')
  })

  it('once(state) fires exactly once and auto-detaches', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })

    let calls = 0
    client.once('state', () => {
      calls += 1
    })

    await client.connect()
    await client.close()
    // Multiple transitions occurred (connecting/authenticating/ready/closing/closed)
    // but once() must have fired only the first.
    expect(calls).toBe(1)
  })

  it('Symbol.asyncDispose closes the client', async () => {
    const localClient = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    await localClient.connect()
    expect(localClient.state.kind).toBe('ready')

    await localClient[Symbol.asyncDispose]()
    expect(localClient.state.kind).toBe('closed')
    if (localClient.state.kind !== 'closed') return
    expect(localClient.state.reason).toBe('user')
  })

  it('does NOT emit "error" on transport failure — failures route to state and connect() rejection', async () => {
    // Close the server before the client dials so connect() always fails.
    await server.close()

    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })

    const errorListener = vi.fn()
    // Cast through unknown so this dynamic listener attaches without
    // teaching TypeScript about an event the typed surface intentionally
    // does not declare.
    ;(client as unknown as EventEmitter).on('error', errorListener)

    await expect(client.connect()).rejects.toBeDefined()
    expect(errorListener).not.toHaveBeenCalled()
    expect(client.state.kind).toBe('closed')
  })

  it('isolates listener throws — a bad state listener does not break fan-out', async () => {
    const warned: Array<Record<string, unknown>> = []
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
      // Capture the warning emitted by the emit override when a listener
      // throws. Only `warn` is exercised here — the rest stay noop.
      logger: {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: (fields) => {
          warned.push(
            typeof fields === 'string' ? { message: fields } : fields,
          )
        },
        error: () => {},
        child () {
          return this
        },
      },
    })

    const a: string[] = []
    const c: string[] = []
    client.on('state', (s) => {
      a.push(s.kind)
    })
    client.on('state', () => {
      throw new Error('boom from listener B')
    })
    client.on('state', (s) => {
      c.push(s.kind)
    })

    await client.connect()

    // A and C both observed every transition despite B throwing.
    expect(a).toEqual(c)
    expect(a.length).toBeGreaterThanOrEqual(3)
    // The override logged at least one warning containing the bad listener's
    // error, and execution did NOT crash through the reconnect loop.
    expect(
      warned.some((w) => {
        const err = w.err as Error | undefined
        return err?.message === 'boom from listener B'
      }),
    ).toBe(true)
  })

  it('external emit("state", fake) fans out to listeners but does not mutate internal state', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    await client.connect()
    expect(client.state.kind).toBe('ready')

    const seen: RconClientState[] = []
    client.on('state', (s) => {
      seen.push(s)
    })
    const fake: RconClientState = { kind: 'idle' }
    client.emit('state', fake)

    // Listeners observed the fake event, but client.state was unaffected
    // because only #setState writes the private field.
    expect(seen).toContain(fake)
    expect(client.state.kind).toBe('ready')
  })

  it('instanceof RconClient narrows', () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    expect(client).toBeInstanceOf(RconClient)
    expect(client).toBeInstanceOf(EventEmitter)
  })
})
