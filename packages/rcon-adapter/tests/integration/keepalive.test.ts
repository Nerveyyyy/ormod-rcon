import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFakeServer, type FakeServer } from '../helpers/fake-server.js'
import { waitForCondition } from '../helpers/wait-for.js'
import { RconClient } from '../../src/index.js'
import { KEEPALIVE_INTERVAL_MS } from '../../src/client/keepalive.js'

/**
 * Integration-level proof that an authenticated client actually
 * participates in the shared keepalive scheduler. The scheduler's timer
 * mechanics are unit-tested in `tests/unit/keepalive.test.ts`; this file
 * asserts the observable effect — server receives a `ping` frame after
 * the interval elapses.
 *
 * We fake only `setInterval` / `clearInterval` so the ws library's real
 * socket I/O (which relies on setTimeout / setImmediate) continues to
 * work normally. Faking the full timer set would deadlock the handshake.
 */

describe('rcon-adapter · keepalive (integration)', () => {
  let server: FakeServer
  let client: RconClient | null = null

  beforeEach(async () => {
    server = await createFakeServer({ secret: 'ok' })
  })

  afterEach(async () => {
    vi.useRealTimers()
    await client?.close()
    client = null
    await server.close()
  })

  it('sends a ping after KEEPALIVE_INTERVAL_MS and stays ready on pong', async () => {
    // Fake timers must be installed BEFORE the client registers its hook,
    // otherwise the setInterval captured by the scheduler runs on real
    // time and the test times out waiting 30s.
    vi.useFakeTimers({ toFake: [ 'setInterval', 'clearInterval' ] })

    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    await client.connect()
    expect(client.state.kind).toBe('ready')
    expect(server.pingCount()).toBe(0)

    // Fire the keepalive tick by advancing fake interval time.
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS + 50)

    // ws.send from the tick callback is synchronous into the socket
    // buffer; the server delivers it on real-time I/O, so wait against
    // real timers.
    vi.useRealTimers()
    await waitForCondition(
      () => {
        return server.pingCount() >= 1
      },
      'server received a ping after the keepalive interval',
      2_000,
    )
    expect(client.state.kind).toBe('ready')
  })
})
