import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFakeServer, type FakeServer } from '../helpers/fake-server.js'
import { waitForCondition } from '../helpers/wait-for.js'
import {
  RconClient,
  RconCommandError,
  RconOverloadError,
  RconProtocolError,
  RconTimeoutError,
  RconTransportError,
  type RconClientState,
} from '../../src/index.js'

// Spec §7 / non-spec code classification is exhaustively covered by the
// pure-function tests in tests/unit/errors.test.ts. The cases below only
// need to prove the classifier is actually wired into the receive path —
// one representative code per class is enough.
describe('rcon-adapter · error taxonomy', () => {
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

  it('surfaces auth_error(invalid_secret) as RconProtocolError', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'wrong',
      reconnect: { enabled: false },
    })
    const connectPromise = client.connect()
    await expect(connectPromise).rejects.toBeInstanceOf(RconProtocolError)
    await expect(connectPromise).rejects.toMatchObject({
      code: 'invalid_secret',
    })
    expect(client.state.kind).toBe('closed')
    if (client.state.kind !== 'closed') return
    expect(client.state.reason).toBe('auth_failed')
  })

  // Spec §7 names three auth_error reasons — `invalid_secret` is covered
  // above with a secret mismatch; the other two come from server state
  // (duplicate auth or connection limit) and are injected via
  // failNextAuth.
  it.each([ 'already_authenticated', 'max_connections' ])(
    'surfaces auth_error(%s) as RconProtocolError and closes with auth_failed',
    async (reason) => {
      server.failNextAuth(reason)
      client = new RconClient({
        url: server.url,
        secret: 'ok',
          reconnect: { enabled: false },
      })
      const connectPromise = client.connect()
      await expect(connectPromise).rejects.toBeInstanceOf(RconProtocolError)
      await expect(connectPromise).rejects.toMatchObject({ code: reason })
      expect(client.state.kind).toBe('closed')
      if (client.state.kind !== 'closed') return
      expect(client.state.reason).toBe('auth_failed')
    },
  )

  it('wires a spec §7 result error through as RconProtocolError', async () => {
    server.stub('kick', () => {
      return {
        success: false,
        error: {
          code: 'PLAYER_NOT_ONLINE',
          message: 'simulated PLAYER_NOT_ONLINE',
        },
      }
    })
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    await client.connect()
    const promise = client.send({
      cmd: 'kick',
      data: { steamId: '76561198001234567' },
    })
    await expect(promise).rejects.toBeInstanceOf(RconProtocolError)
    await expect(promise).rejects.toMatchObject({ code: 'PLAYER_NOT_ONLINE' })
  })

  it('wires a non-spec result error through as RconCommandError', async () => {
    server.stub('kick', () => {
      return {
        success: false,
        error: {
          code: 'PLUGIN_SPECIFIC_ERROR',
          message: 'server-specific PLUGIN_SPECIFIC_ERROR',
        },
      }
    })
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    await client.connect()
    const promise = client.send({
      cmd: 'kick',
      data: { steamId: '76561198001234567' },
    })
    await expect(promise).rejects.toBeInstanceOf(RconCommandError)
    await expect(promise).rejects.toMatchObject({ code: 'PLUGIN_SPECIFIC_ERROR' })
  })

  it('surfaces a command timeout as RconTimeoutError', async () => {
    // stallCommand makes the server receive the command but never reply,
    // forcing the client's own commandTimeoutMs to fire. The client-side
    // timeout path is command-agnostic, so any real command works — use
    // getplayers so the test stays within the typed RconCommand union.
    server.stallCommand('getplayers')
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
      limits: { commandTimeoutMs: 100 },
    })
    await client.connect()
    await expect(client.send({ cmd: 'getplayers' })).rejects.toBeInstanceOf(
      RconTimeoutError,
    )
  })

  it('rejects with RconOverloadError when in-flight cap is hit and lets earlier commands finish', async () => {
    // Hold the server responses until we explicitly release them. This
    // ensures all three sends are genuinely in-flight when the third
    // hits the cap, and asserts the stronger invariant that the overload
    // rejection does NOT invalidate the other pending commands — they
    // still resolve normally once the server replies.
    const holds: Array<() => void> = []
    server.stub('kick', () => {
      return new Promise((resolve) => {
        holds.push(() => {
          return resolve({ success: true, data: {} })
        })
      })
    })
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
      limits: { maxInFlightCommands: 2 },
    })
    await client.connect()
    const a = client.send({ cmd: 'kick', data: { steamId: '1' } })
    const b = client.send({ cmd: 'kick', data: { steamId: '2' } })
    const c = client.send({ cmd: 'kick', data: { steamId: '3' } })
    await expect(c).rejects.toBeInstanceOf(RconOverloadError)
    await expect(c).rejects.toMatchObject({ reason: 'in_flight_cap' })
    // ws delivery is an I/O macrotask — the earlier awaits only drained
    // microtasks, so a/b frames may not have reached the server yet.
    // Wait for the server to register both before releasing responses.
    await waitForCondition(
      () => {
        return holds.length >= 2
      },
      'server received both in-flight commands',
    )
    for (const release of holds) {
      release()
    }
    await expect(a).resolves.toBeDefined()
    await expect(b).resolves.toBeDefined()
  })

  it('rejects send() with RconTransportError(not_ready) before connect', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    const promise = client.send({ cmd: 'getplayers' })
    await expect(promise).rejects.toBeInstanceOf(RconTransportError)
    await expect(promise).rejects.toMatchObject({ code: 'not_ready' })
  })

  it('rejects send() with not_ready during the authenticating window', async () => {
    // Call send() synchronously from inside the state listener the moment
    // the state transitions to `authenticating`. The send should reject
    // with not_ready because the auth handshake hasn't completed, not
    // silently queue.
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    let sendDuringAuth: Promise<unknown> | null = null
    const onState = (s: RconClientState): void => {
      if (s.kind === 'authenticating' && sendDuringAuth === null) {
        const p = client!.send({ cmd: 'getplayers' })
        // Attach a silencer synchronously so Node doesn't flag an
        // unhandledRejection in the microtask window before the test's
        // `.rejects` matcher attaches its own handler. The original
        // rejection is still observable via `sendDuringAuth` below.
        p.catch(() => {})
        sendDuringAuth = p
      }
    }
    client.on('state', onState)
    await client.connect()
    client.off('state', onState)
    expect(sendDuringAuth).not.toBeNull()
    await expect(sendDuringAuth).rejects.toBeInstanceOf(RconTransportError)
    await expect(sendDuringAuth).rejects.toMatchObject({ code: 'not_ready' })
  })
})
