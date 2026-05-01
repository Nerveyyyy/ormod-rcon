import { describe, it, expect } from 'vitest'
import {
  classifyRconError,
  isRconProtocolErrorCode,
  RconCommandError,
  RconProtocolError,
} from '../../src/protocol/errors.js'

/**
 * Pure-function coverage for the error-code classifier. The integration
 * suite (tests/integration/errors.test.ts) only needs to prove that the
 * classifier is actually wired into the receive path — the exhaustive
 * per-code matrix lives here where it runs without spinning up a socket.
 */

const SPEC_ERROR_CODES = [
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
] as const

const AUTH_ERROR_REASONS = [
  'invalid_secret',
  'already_authenticated',
  'max_connections',
] as const

const NON_SPEC_ERROR_CODES = [
  'CUSTOM_SERVER_CODE',
  'PLUGIN_SPECIFIC_ERROR',
  'THIRD_PARTY_ACME',
  '',
  'lowercase_unknown',
] as const

describe('isRconProtocolErrorCode', () => {
  it.each([ ...SPEC_ERROR_CODES, ...AUTH_ERROR_REASONS ])(
    'returns true for spec code %s',
    (code) => {
      expect(isRconProtocolErrorCode(code)).toBe(true)
    },
  )

  it.each(NON_SPEC_ERROR_CODES)(
    'returns false for non-spec code %s',
    (code) => {
      expect(isRconProtocolErrorCode(code)).toBe(false)
    },
  )
})

describe('classifyRconError', () => {
  it.each([ ...SPEC_ERROR_CODES, ...AUTH_ERROR_REASONS ])(
    'maps spec code %s to RconProtocolError with code preserved',
    (code) => {
      const err = classifyRconError(code, `simulated ${ code }`)
      expect(err).toBeInstanceOf(RconProtocolError)
      expect(err.code).toBe(code)
      expect(err.message).toBe(`simulated ${ code }`)
    },
  )

  it.each(NON_SPEC_ERROR_CODES)(
    'maps non-spec code %s to RconCommandError with raw code preserved',
    (code) => {
      const err = classifyRconError(code, `server-specific ${ code }`)
      expect(err).toBeInstanceOf(RconCommandError)
      expect(err.code).toBe(code)
      expect(err.message).toBe(`server-specific ${ code }`)
    },
  )
})
