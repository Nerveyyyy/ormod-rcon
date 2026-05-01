import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createFakeServer,
  type FakeServer,
  type CommandResult,
} from '../helpers/fake-server.js'
import { waitForCondition } from '../helpers/wait-for.js'
import {
  RconClient,
  type RconEvent,
} from '../../src/index.js'

describe('rcon-adapter · happy path', () => {
  let server: FakeServer
  let client: RconClient | null = null
  let events: RconEvent[] = []

  beforeEach(async () => {
    server = await createFakeServer({ secret: 'ok' })
    events = []
  })

  afterEach(async () => {
    await client?.close()
    client = null
    await server.close()
  })

  it('connects, auths, and surfaces the ready state', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    client.on('gameEvent', (e) => {
      events.push(e)
    })
    await client.connect()

    expect(client.state.kind).toBe('ready')
    if (client.state.kind !== 'ready') return
    expect(client.state.serverName).toBe('FakeServer')
    expect(client.state.version).toBe('1.0.0')
    expect(server.connectionCount()).toBe(1)
  })

  it('round-trips a no-param command (getplayers)', async () => {
    server.stub('getplayers', () => {
      return {
        success: true,
        data: {
          count: 1,
          players: [
            { steamId: '76561198001234567', displayName: 'Alpha' },
          ],
        },
      }
    })

    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    client.on('gameEvent', (e) => {
      events.push(e)
    })
    await client.connect()

    const result = await client.send<{
      count: number
      players: Array<{ steamId: string, displayName: string }>
    }>({ cmd: 'getplayers' })

    expect(result.count).toBe(1)
    expect(result.players[0]?.steamId).toBe('76561198001234567')
  })

  it('round-trips a parameterised command (kick)', async () => {
    let receivedData: unknown = null
    server.stub('kick', (data) => {
      receivedData = data
      return {
        success: true,
        data: { steamId: (data as { steamId: string }).steamId },
      }
    })

    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    client.on('gameEvent', (e) => {
      events.push(e)
    })
    await client.connect()

    const r = await client.send<{ steamId: string }>({
      cmd: 'kick',
      data: { steamId: '76561198001234567', reason: 'test' },
    })

    expect(r.steamId).toBe('76561198001234567')
    expect(receivedData).toEqual({
      steamId: '76561198001234567',
      reason: 'test',
    })
  })

  it('correlates concurrent command responses by id, not by arrival order', async () => {
    // Captures each incoming command's resolver so the test can flush
    // responses in the reverse of the request order. If the adapter
    // correlates by array position instead of by id, this will fail.
    // Uses `kick` (a real command in the typed union) with distinct
    // steamIds as the synthetic sequence marker — correlation behaviour
    // is payload-agnostic.
    const pending: Array<{
      steamId: string
      respond: (result: CommandResult) => void
    }> = []

    server.stub('kick', (data) => {
      return new Promise<CommandResult>((resolve) => {
        pending.push({
          steamId: (data as { steamId: string }).steamId,
          respond: resolve,
        })
      })
    })

    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    client.on('gameEvent', (e) => {
      events.push(e)
    })
    await client.connect()

    const p1 = client.send<{ steamId: string }>({
      cmd: 'kick',
      data: { steamId: '1' },
    })
    const p2 = client.send<{ steamId: string }>({
      cmd: 'kick',
      data: { steamId: '2' },
    })
    const p3 = client.send<{ steamId: string }>({
      cmd: 'kick',
      data: { steamId: '3' },
    })

    await waitForCondition(
      () => {
        return pending.length >= 3
      },
      '3 commands received by server',
    )

    pending[2]!.respond({ success: true, data: { steamId: '3' } })
    pending[1]!.respond({ success: true, data: { steamId: '2' } })
    pending[0]!.respond({ success: true, data: { steamId: '1' } })

    expect(await p1).toEqual({ steamId: '1' })
    expect(await p2).toEqual({ steamId: '2' })
    expect(await p3).toEqual({ steamId: '3' })
  })

  it('surfaces server events via the gameEvent emitter with flattened shape', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    client.on('gameEvent', (e) => {
      events.push(e)
    })
    await client.connect()

    server.sendEvent(
      {
        name: 'player.join',
        steamId: '76561198001234567',
        displayName: 'CoolPlayer',
        ip: '203.0.113.77',
      },
      '2026-03-01T14:33:00.000Z',
    )

    await waitForCondition(
      () => {
        return events.length >= 1
      },
      'first gameEvent delivered',
    )
    expect(events).toHaveLength(1)
    const e = events[0]
    if (e?.name !== 'player.join') {
      throw new Error('expected player.join')
    }
    expect(e.timestamp).toBe('2026-03-01T14:33:00.000Z')
    expect(e.steamId).toBe('76561198001234567')
    expect(e.displayName).toBe('CoolPlayer')
    expect(e.ip).toBe('203.0.113.77')
  })

  it('transitions state through connecting → authenticating → ready', async () => {
    const transitions: string[] = []
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    client.on('state', (s) => {
      transitions.push(s.kind)
    })
    await client.connect()
    // idle is the initial state — listeners only see changes after attach.
    expect(transitions).toContain('connecting')
    expect(transitions).toContain('authenticating')
    expect(transitions).toContain('ready')
  })

  it('close() moves the client to closed(user)', async () => {
    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: { enabled: false },
    })
    await client.connect()
    await client.close()
    expect(client.state.kind).toBe('closed')
    if (client.state.kind !== 'closed') return
    expect(client.state.reason).toBe('user')
  })
})
