import type { RconCommand, RconEvent, IsoTimestamp } from './schema.js'
import { RconTransportError } from './errors.js'

// Decoded events are flattened — the wire envelope's `timestamp` is hoisted
// onto the body so consumers see one shape per event variant.

export type DecodedFrame =
  | {
      kind: 'auth_ok',
      serverTime: IsoTimestamp,
      serverName: string,
      version: string,
    }
  | { kind: 'auth_error', reason: string }
  | { kind: 'result_ok', id: string, data: unknown }
  | { kind: 'result_error', id: string, code: string, message: string }
  | { kind: 'event', event: RconEvent }
  | { kind: 'pong', serverTime: IsoTimestamp }

// ── Encoders ────────────────────────────────────────────────────────────────

export const encodeAuth = (secret: string): string => {
  return JSON.stringify({ type: 'auth', secret })
}

export const encodePing = (): string => {
  return JSON.stringify({ type: 'ping' })
}

export const encodeCommand = (command: RconCommand, id: string): string => {
  // Spec §2: omit `data` for no-param commands.
  if ('data' in command) {
    return JSON.stringify({
      type: 'command',
      id,
      cmd: command.cmd,
      data: command.data,
    })
  }
  return JSON.stringify({ type: 'command', id, cmd: command.cmd })
}

// ── Decoder ─────────────────────────────────────────────────────────────────

export const decodeFrame = (data: string): DecodedFrame => {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch (err) {
    throw new RconTransportError(
      `failed to parse frame as JSON: ${ (err as Error).message }`,
      'unknown_frame',
    )
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RconTransportError('frame is not a JSON object', 'unknown_frame')
  }

  const frame = parsed as Record<string, unknown>
  const type = frame.type

  if (type === 'auth_ok') {
    return {
      kind: 'auth_ok',
      serverTime: String(frame.serverTime),
      serverName: String(frame.serverName),
      version: String(frame.version),
    }
  }

  if (type === 'auth_error') {
    return { kind: 'auth_error', reason: String(frame.reason) }
  }

  if (type === 'result') {
    const id = String(frame.id)
    if (frame.success === true) {
      return { kind: 'result_ok', id, data: frame.data }
    }
    const errObj = frame.error as { code?: unknown, message?: unknown } | undefined
    const code = typeof errObj?.code === 'string' ? errObj.code : 'UNKNOWN'
    const message = typeof errObj?.message === 'string' ? errObj.message : ''
    return {
      kind: 'result_error',
      id,
      code,
      message,
    }
  }

  if (type === 'event') {
    const envelopeTimestamp = String(frame.timestamp)
    const eventBody = frame.event as Record<string, unknown> | undefined
    if (
      eventBody === undefined
      || eventBody === null
      || typeof eventBody.name !== 'string'
    ) {
      throw new RconTransportError(
        'event frame missing event.name',
        'unknown_frame',
      )
    }
    const { name, ...rest } = eventBody
    // Spread body first so the envelope `timestamp` wins if a future event
    // ever carries its own.
    const flat = {
      ...rest,
      name,
      timestamp: envelopeTimestamp,
    } as RconEvent
    return { kind: 'event', event: flat }
  }

  if (type === 'pong') {
    return { kind: 'pong', serverTime: String(frame.serverTime) }
  }

  throw new RconTransportError(
    `unknown frame type: ${ typeof type === 'string' ? type : typeof type }`,
    'unknown_frame',
  )
}
