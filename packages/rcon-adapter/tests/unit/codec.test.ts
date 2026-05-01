import { describe, it, expect } from 'vitest'
import {
  encodeAuth,
  encodePing,
  encodeCommand,
  decodeFrame,
} from '../../src/protocol/codec.js'
import { RconTransportError } from '../../src/protocol/errors.js'

const ENVELOPE_TS = '2026-03-01T14:33:00.000Z'

const decodeEvent = (
  eventBody: Record<string, unknown>,
  timestamp = ENVELOPE_TS,
): Record<string, unknown> => {
  const f = decodeFrame(
    JSON.stringify({ type: 'event', timestamp, event: eventBody }),
  )
  if (f.kind !== 'event') {
    throw new Error(`expected event frame, got kind=${ f.kind }`)
  }
  return f.event as Record<string, unknown>
}

describe('codec — encoders', () => {
  it('encodeAuth produces the spec frame', () => {
    expect(JSON.parse(encodeAuth('sekret'))).toEqual({
      type: 'auth',
      secret: 'sekret',
    })
  })

  it('encodePing produces the spec frame', () => {
    expect(JSON.parse(encodePing())).toEqual({ type: 'ping' })
  })

  it('encodeCommand omits data for no-param commands', () => {
    const wire = JSON.parse(encodeCommand({ cmd: 'getplayers' }, 'req-1')) as Record<string, unknown>
    expect(wire).toEqual({ type: 'command', id: 'req-1', cmd: 'getplayers' })
    expect('data' in wire).toBe(false)
  })

  it('encodeCommand passes nested data payloads through verbatim', () => {
    const wire = JSON.parse(
      encodeCommand(
        {
          cmd: 'wipe',
          data: { type: 'playerdata', steamId: '76561198001234567' },
        },
        'req-3',
      ),
    ) as Record<string, unknown>
    expect(wire).toEqual({
      type: 'command',
      id: 'req-3',
      cmd: 'wipe',
      data: { type: 'playerdata', steamId: '76561198001234567' },
    })
  })
})

describe('codec — decodeFrame happy paths', () => {
  it('decodes auth_ok', () => {
    const f = decodeFrame(
      JSON.stringify({
        type: 'auth_ok',
        serverTime: '2026-03-01T14:32:00.000Z',
        serverName: 'My Server',
        version: '1.0.0',
      }),
    )
    expect(f).toEqual({
      kind: 'auth_ok',
      serverTime: '2026-03-01T14:32:00.000Z',
      serverName: 'My Server',
      version: '1.0.0',
    })
  })

  it('decodes auth_error', () => {
    const f = decodeFrame(
      JSON.stringify({ type: 'auth_error', reason: 'invalid_secret' }),
    )
    expect(f).toEqual({ kind: 'auth_error', reason: 'invalid_secret' })
  })

  it('decodes result success and failure shapes', () => {
    const ok = decodeFrame(
      JSON.stringify({
        type: 'result',
        id: 'req-1',
        success: true,
        data: { count: 2 },
      }),
    )
    expect(ok).toEqual({ kind: 'result_ok', id: 'req-1', data: { count: 2 } })

    const err = decodeFrame(
      JSON.stringify({
        type: 'result',
        id: 'req-1',
        success: false,
        error: { code: 'PLAYER_NOT_ONLINE', message: 'not connected' },
      }),
    )
    expect(err).toEqual({
      kind: 'result_error',
      id: 'req-1',
      code: 'PLAYER_NOT_ONLINE',
      message: 'not connected',
    })
  })

  it('decodes pong', () => {
    const f = decodeFrame(
      JSON.stringify({ type: 'pong', serverTime: '2026-03-01T14:32:15.000Z' }),
    )
    expect(f).toEqual({
      kind: 'pong',
      serverTime: '2026-03-01T14:32:15.000Z',
    })
  })
})

describe('codec — event flatten shape', () => {
  // Spec §2 wraps events in { type: 'event', timestamp, event: {...} }.
  // Decode lifts the envelope timestamp into the event body and passes
  // unknown fields through verbatim — one data-driven test covers every
  // straight passthrough variant.
  // Four representative shapes cover every behaviour the decoder owns:
  // a standard multi-field payload, explicit null preservation, an
  // empty-body event, and the spec §4 catch-all for unknown names.
  // The decoder is payload-agnostic — additional known variants add no
  // new branches to exercise.
  it.each([
    {
      name: 'player.join',
      body: {
        steamId: '76561198001234567',
        displayName: 'CoolPlayer',
        ip: '203.0.113.77',
      },
    },
    {
      name: 'player.permission.change',
      body: {
        steamId: '76561198001234567',
        displayName: 'CoolPlayer',
        previous: null,
        current: 'admin',
        changedBy: 'rcon',
      },
    },
    {
      name: 'server.save',
      body: {},
    },
    // Spec §4: unknown event.name values pass through so new server
    // events do not break old clients.
    {
      name: 'future.protocol.addition',
      body: { customField: 42 },
    },
  ])('lifts envelope timestamp and passes $name payload through', (
    { name, body },
  ) => {
    const e = decodeEvent({ name, ...body })
    expect(e.name).toBe(name)
    expect(e.timestamp).toBe(ENVELOPE_TS)
    for (const [ k, v ] of Object.entries(body)) {
      expect(e[k]).toEqual(v)
    }
  })

  it('preserves wipe.complete.wipedAt distinct from envelope timestamp', () => {
    // Spec §5: wipedAt is the canonical "last wiped at" timestamp and must
    // not be overwritten by the envelope timestamp during flatten.
    const envelopeTs = '2026-03-01T14:33:00.000Z'
    const wipedAt = '2026-03-01T05:00:12.000Z'
    const e = decodeEvent(
      {
        name: 'wipe.complete',
        type: 'full',
        durationMs: 760,
        wipedAt,
      },
      envelopeTs,
    )
    expect(e.timestamp).toBe(envelopeTs)
    expect(e.wipedAt).toBe(wipedAt)
  })
})

describe('codec — player.death source variants', () => {
  it('with source=player preserves killer, weapon, and hit telemetry', () => {
    const e = decodeEvent({
      name: 'player.death',
      victim: {
        steamId: '76561198001234567',
        location: { x: 45, y: 1, z: -22 },
      },
      source: 'player',
      cause: 'Gunshot',
      killer: {
        steamId: '76561198007654321',
        location: { x: 190, y: 3, z: 160 },
      },
      weapon: {
        itemId: 'rifle_bolt',
        name: 'Bolt-Action Rifle',
        attachments: [ 'scope_4x', 'suppressor' ],
        ammoType: 'ammo_762',
      },
      hit: {
        zone: 'head',
        headshot: true,
        distanceMeters: 215.6,
      },
    })
    expect(e.source).toBe('player')
    expect(e.killer).toEqual({
      steamId: '76561198007654321',
      location: { x: 190, y: 3, z: 160 },
    })
    expect((e.weapon as Record<string, unknown>).itemId).toBe('rifle_bolt')
    expect((e.weapon as Record<string, unknown>).attachments).toEqual([
      'scope_4x',
      'suppressor',
    ])
    expect((e.hit as Record<string, unknown>).headshot).toBe(true)
    expect((e.hit as Record<string, unknown>).distanceMeters).toBe(215.6)
  })

  // Spec §5: killer / weapon / hit are only present when source === 'player'.
  // Decoding any other source variant must not inject those fields.
  it.each([
    { source: 'environment', cause: 'Drowning' },
    { source: 'ai', cause: 'Bear' },
    { source: 'suicide', cause: 'Self-inflicted' },
  ])('with source=$source omits killer, weapon, and hit', (
    { source, cause },
  ) => {
    const e = decodeEvent({
      name: 'player.death',
      victim: {
        steamId: '76561198001234567',
        location: { x: 1, y: 2, z: 3 },
      },
      source,
      cause,
    })
    expect(e.source).toBe(source)
    expect(e.cause).toBe(cause)
    expect(e.killer).toBeUndefined()
    expect(e.weapon).toBeUndefined()
    expect(e.hit).toBeUndefined()
  })
})

describe('codec — decodeFrame malformed', () => {
  it.each([
    { label: 'invalid JSON', wire: 'not-json' },
    { label: 'number literal', wire: '42' },
    { label: 'null literal', wire: 'null' },
    { label: 'array literal', wire: '[]' },
    {
      label: 'unknown frame type',
      wire: JSON.stringify({ type: 'not_a_frame_type' }),
    },
  ])('throws RconTransportError on $label', ({ wire }) => {
    expect(() => decodeFrame(wire)).toThrow(RconTransportError)
  })

  it('throws on event missing event.name', () => {
    expect(() => {
      return decodeFrame(
        JSON.stringify({
          type: 'event',
          timestamp: '2026-03-01T14:33:00.000Z',
          event: { missingName: true },
        }),
      )
    }).toThrow(/event\.name/)
  })
})