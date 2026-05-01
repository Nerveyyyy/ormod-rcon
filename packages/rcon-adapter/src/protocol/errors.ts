// See README "Errors" table for the discriminator → meaning map.

export type RconTransportErrorCode =
  | 'socket_closed'
  | 'handshake_failed'
  | 'tls_error'
  | 'frame_too_large'
  | 'unknown_frame'
  | 'not_ready'

export class RconTransportError extends Error {
  readonly code: RconTransportErrorCode

  constructor (message: string, code: RconTransportErrorCode) {
    super(message)
    this.name = 'RconTransportError'
    this.code = code
  }
}

// Spec §7 codes + auth_error reasons. Auth reasons live here (not on
// TransportError) because the socket opened and the server replied — it's
// a protocol-level outcome, not a socket fault.
export type RconProtocolErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'UNKNOWN_COMMAND'
  | 'INVALID_ARGS'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_NOT_ONLINE'
  | 'ENTITY_NOT_FOUND'
  | 'SETTING_NOT_FOUND'
  | 'WIPE_IN_PROGRESS'
  | 'INVALID_KIT'
  | 'INTERNAL_ERROR'
  | 'invalid_secret'
  | 'already_authenticated'
  | 'max_connections'

export class RconProtocolError extends Error {
  readonly code: RconProtocolErrorCode

  constructor (message: string, code: RconProtocolErrorCode) {
    super(message)
    this.name = 'RconProtocolError'
    this.code = code
  }
}

// Game-side errors whose `code` is NOT in spec §7 — preserved verbatim so
// callers can switch on plugin-specific codes.
export class RconCommandError extends Error {
  readonly code: string

  constructor (message: string, code: string) {
    super(message)
    this.name = 'RconCommandError'
    this.code = code
  }
}

export class RconTimeoutError extends Error {
  readonly commandId: string
  readonly elapsedMs: number

  constructor (commandId: string, elapsedMs: number) {
    super(`Command ${ commandId } timed out after ${ elapsedMs }ms`)
    this.name = 'RconTimeoutError'
    this.commandId = commandId
    this.elapsedMs = elapsedMs
  }
}

export type RconOverloadReason = 'in_flight_cap' | 'buffered_amount'

export class RconOverloadError extends Error {
  readonly reason: RconOverloadReason

  constructor (message: string, reason: RconOverloadReason) {
    super(message)
    this.name = 'RconOverloadError'
    this.reason = reason
  }
}

const PROTOCOL_ERROR_CODES: ReadonlySet<string> = new Set<RconProtocolErrorCode>([
  'NOT_AUTHENTICATED',
  'UNKNOWN_COMMAND',
  'INVALID_ARGS',
  'PLAYER_NOT_FOUND',
  'PLAYER_NOT_ONLINE',
  'ENTITY_NOT_FOUND',
  'SETTING_NOT_FOUND',
  'WIPE_IN_PROGRESS',
  'INVALID_KIT',
  'INTERNAL_ERROR',
  'invalid_secret',
  'already_authenticated',
  'max_connections',
])

export const isRconProtocolErrorCode = (
  code: string,
): code is RconProtocolErrorCode => {
  return PROTOCOL_ERROR_CODES.has(code)
}

export const classifyRconError = (
  code: string,
  message: string,
): RconProtocolError | RconCommandError => {
  if (isRconProtocolErrorCode(code)) {
    return new RconProtocolError(message, code)
  }
  return new RconCommandError(message, code)
}
