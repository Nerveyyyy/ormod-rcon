import { encodeAuth } from '../protocol/codec.js'
import {
  isRconProtocolErrorCode,
  RconProtocolError,
  RconTransportError,
  type RconProtocolErrorCode,
} from '../protocol/errors.js'
import type { Transport } from '../transport/ws-transport.js'
import type { IsoTimestamp } from '../protocol/schema.js'
import { publishAuth } from '../telemetry/diagnostics.js'

// Server has this long to reply to our auth frame before we treat the
// connection as dead. Spec doesn't mandate a deadline; we pick a value in
// line with the WS handshake timeout so a wedged server can't strand us
// forever.
export const AUTH_REPLY_TIMEOUT_MS = 10_000

export interface AuthInfo {
  serverTime: IsoTimestamp
  serverName: string
  version: string
}

export interface AuthenticatorOptions {
  secret: string
  url: string
  // Test seam — production callers leave this undefined.
  replyTimeoutMs?: number
}

export interface Authenticator {
  run (transport: Transport): Promise<AuthInfo>
  handleAuthOk (info: AuthInfo): void
  handleAuthError (reason: string): void
  cancel (): void
}

interface Pending {
  resolve: (info: AuthInfo) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export const createAuthenticator = (
  options: AuthenticatorOptions,
): Authenticator => {
  const replyTimeoutMs = options.replyTimeoutMs ?? AUTH_REPLY_TIMEOUT_MS
  let pending: Pending | null = null

  // Single settle point. Clears the ref and timer BEFORE invoking apply so
  // late frames (auth_error after timer fired, etc.) are no-ops rather than
  // double-settles.
  const settle = (apply: (p: Pending) => void): void => {
    const p = pending
    if (p === null) {
      return
    }
    pending = null
    clearTimeout(p.timer)
    apply(p)
  }

  return {
    run: (transport) => {
      if (pending !== null) {
        return Promise.reject(new Error('auth already in progress'))
      }
      return new Promise<AuthInfo>((resolve, reject) => {
        // Arm the deferred and timer BEFORE sending so a synchronous
        // transport.send throw settles via the same idempotent path.
        const timer = setTimeout(() => {
          settle((p) => {
            p.reject(
              new RconTransportError(
                `auth reply timeout — no auth_ok/auth_error within ${ replyTimeoutMs }ms`,
                'socket_closed',
              ),
            )
          })
        }, replyTimeoutMs)
        pending = { resolve, reject, timer }
        try {
          // Lifecycle frame — bypasses flow-control intentionally.
          transport.send(encodeAuth(options.secret))
        } catch (err) {
          settle((p) => {
            p.reject(
              err instanceof Error
                ? err
                : new RconTransportError(String(err), 'socket_closed'),
            )
          })
        }
      })
    },

    handleAuthOk: (info) => {
      publishAuth({ url: options.url, result: 'ok' })
      settle((p) => {
        p.resolve(info)
      })
    },

    handleAuthError: (reason) => {
      publishAuth({ url: options.url, result: 'error', reason })
      settle((p) => {
        // Auth errors are always RconProtocolError. Do NOT route through
        // classifyRconError — that helper can return RconCommandError for
        // non-spec codes, which is wrong for auth.
        const code: RconProtocolErrorCode = isRconProtocolErrorCode(reason)
          ? reason
          : 'invalid_secret'
        p.reject(new RconProtocolError(`auth rejected: ${ reason }`, code))
      })
    },

    cancel: () => {
      settle((p) => {
        p.reject(new Error('auth canceled'))
      })
    },
  }
}
