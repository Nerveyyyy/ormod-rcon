import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFakeServer, type FakeServer } from '../helpers/fake-server.js'
import { waitForState } from '../helpers/wait-for.js'
import { RconClient } from '../../src/index.js'

const FAST_RECONNECT = {
  initialDelayMs: 20,
  maxDelayMs: 100,
  jitter: 0,
  enabled: true,
}

describe('rcon-adapter · reconnect', () => {
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

  it('reconnects after server disconnects an authenticated client', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: FAST_RECONNECT,
    })
    await client.connect()
    expect(client.state.kind).toBe('ready')

    // 1006 is a reserved "abnormal closure" code receivers observe but
    // applications cannot send. Use 1011 (internal server error).
    server.disconnectAll(1011, 'force')

    // Should transition to reconnecting, then back to ready
    await waitForState(client, ['reconnecting'])
    await waitForState(client, ['ready'])
    expect(client.state.kind).toBe('ready')
  })

  it('increments attempt counter across failed reconnects', async () => {
    // Close the server before first connect to force failures.
    await server.close()

    const attempts: number[] = []
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { ...FAST_RECONNECT, maxDelayMs: 40 },
    })
    client.on('state', (s) => {
      if (s.kind === 'reconnecting') {
        attempts.push(s.attempt)
      }
    })
    // connect() will keep retrying in the background. Capture a few
    // reconnect cycles, then abort via close().
    const connectPromise = client.connect()
    connectPromise.catch(() => {})
    await new Promise((r) => setTimeout(r, 150))
    // Should have seen multiple reconnecting transitions
    expect(attempts.length).toBeGreaterThanOrEqual(2)
    // Attempts monotonically increase
    for (let i = 1; i < attempts.length; i += 1) {
      expect(attempts[i]).toBeGreaterThanOrEqual(attempts[i - 1] as number)
    }
  })

  it('AbortSignal halts the reconnect loop and moves to closed(user)', async () => {
    await server.close()

    const controller = new AbortController()
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: FAST_RECONNECT,
      signal: controller.signal,
    })
    client.connect().catch(() => {})
    // Wait until we're in reconnecting at least once
    await waitForState(client, ['reconnecting', 'connecting'])
    controller.abort()
    await waitForState(client, ['closed'])
    expect(client.state.kind).toBe('closed')
    if (client.state.kind !== 'closed') return
    expect(client.state.reason).toBe('user')
  })
})
