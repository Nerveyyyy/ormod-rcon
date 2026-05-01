import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import diagnosticsChannel from 'node:diagnostics_channel'
import { createFakeServer, type FakeServer } from '../helpers/fake-server.js'
import { waitForCondition } from '../helpers/wait-for.js'
import {
  RconClient,
  DIAGNOSTICS_CHANNELS,
} from '../../src/index.js'

/**
 * End-to-end smoke for the eight `node:diagnostics_channel` channels the
 * adapter publishes to. A representative round-trip exercises six of them
 * (connect / auth / command.send / command.resolve / event / disconnect);
 * `error` and `backpressure` only fire on failure / saturation paths and
 * are covered separately at the unit level.
 */
describe('rcon-adapter · diagnostics channels', () => {
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

  it('publishes connect / auth / command / event / disconnect during a round-trip', async () => {
    const observed = new Set<string>()
    const subscriptions = Object.entries(DIAGNOSTICS_CHANNELS).map(([
      key,
      name,
    ]) => {
      const handler = (): void => {
        observed.add(name)
      }
      diagnosticsChannel.subscribe(name, handler)
      return { key, name, handler }
    })

    try {
      server.stub('getplayers', () => {
        return { success: true, data: { count: 0, players: [] } }
      })

      client = new RconClient({
        url: server.url,
        secret: 'ok',
        reconnect: { enabled: false },
      })
      await client.connect()
      await client.send({ cmd: 'getplayers' })

      server.sendEvent({
        name: 'player.join',
        steamId: '76561198001234567',
        displayName: 'DiagTester',
        ip: '203.0.113.9',
      })
      await waitForCondition(() => {
        return observed.has(DIAGNOSTICS_CHANNELS.event)
      }, 'event channel observed')

      // disconnect publishes only on connection-loss (server kicks us or
      // the socket drops), NOT on operator-driven close(). Force a server
      // disconnect to exercise that code path.
      server.disconnectAll(1011, 'force diagnostics test')
      await waitForCondition(() => {
        return observed.has(DIAGNOSTICS_CHANNELS.disconnect)
      }, 'disconnect channel observed')

      expect(observed).toContain(DIAGNOSTICS_CHANNELS.connect)
      expect(observed).toContain(DIAGNOSTICS_CHANNELS.auth)
      expect(observed).toContain(DIAGNOSTICS_CHANNELS.commandSend)
      expect(observed).toContain(DIAGNOSTICS_CHANNELS.commandResolve)
      expect(observed).toContain(DIAGNOSTICS_CHANNELS.event)
      expect(observed).toContain(DIAGNOSTICS_CHANNELS.disconnect)
    } finally {
      for (const { name, handler } of subscriptions) {
        diagnosticsChannel.unsubscribe(name, handler)
      }
    }
  })
})
