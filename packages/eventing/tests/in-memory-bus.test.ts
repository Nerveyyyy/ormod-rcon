import { describe, it, expect, vi } from 'vitest'
import { InMemoryEventBus } from '../src/in-memory-bus.js'
import type { BusLogger, EventContext } from '../src/event-bus.js'
import type { PlayerJoinedPayload } from '../src/events.js'

const silentLogger: BusLogger = { error: () => {} }

const ctx: EventContext = {
  tenantId: 'tenant-1',
  serverId: 'server-1',
  correlationId: 'corr-1',
}

const samplePayload: PlayerJoinedPayload = {
  serverId: 'server-1',
  playerId: 'player-1',
  steamId: '76561198000000001',
  name: 'Alice',
  ip: '203.0.113.5',
  at: new Date('2026-04-19T00:00:00Z'),
}

describe('InMemoryEventBus', () => {
  it('delivers to subscribed handlers', async () => {
    const bus = new InMemoryEventBus(silentLogger)
    const handler = vi.fn()
    bus.subscribe('player.joined', handler)

    await bus.publish('player.joined', samplePayload, ctx)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(samplePayload, ctx)
  })

  it('unsubscribe stops further delivery', async () => {
    const bus = new InMemoryEventBus(silentLogger)
    const handler = vi.fn()
    const off = bus.subscribe('player.joined', handler)

    await bus.publish('player.joined', samplePayload, ctx)
    off()
    await bus.publish('player.joined', samplePayload, ctx)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('subscribeAll receives every event with name and payload', async () => {
    const bus = new InMemoryEventBus(silentLogger)
    const seen: string[] = []
    bus.subscribeAll((name) => {
      seen.push(name)
    })

    await bus.publish('player.joined', samplePayload, ctx)
    await bus.publish('server.status', {
      serverId: 'server-1',
      state: 'connected',
      playerCount: 5,
      lastErrorReason: null,
      at: new Date(),
    }, ctx)

    expect(seen).toEqual([ 'player.joined', 'server.status' ])
  })

  it('isolates a throwing handler from the rest', async () => {
    const errorCalls: Array<Record<string, unknown>> = []
    const logger: BusLogger = {
      error: (obj) => {
        errorCalls.push(obj)
      },
    }
    const bus = new InMemoryEventBus(logger)

    const good = vi.fn()
    bus.subscribe('player.joined', () => {
      throw new Error('boom')
    })
    bus.subscribe('player.joined', good)

    await bus.publish('player.joined', samplePayload, ctx)

    expect(good).toHaveBeenCalledTimes(1)
    expect(errorCalls).toHaveLength(1)
    expect(errorCalls[0]?.event).toBe('player.joined')
  })
})
