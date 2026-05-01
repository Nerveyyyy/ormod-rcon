/**
 * Recognises transient connection-class failures from postgres-js /
 * Drizzle. These are operational signals, not bugs — the pool will
 * reconnect on its own, so we log them at warn without a stack rather
 * than burying real errors under reconnect noise.
 */

const TRANSIENT_PATTERNS = [
  'CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ENETUNREACH',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
] as const

const containsTransientPattern = (text: string): boolean => {
  return TRANSIENT_PATTERNS.some((p) => { return text.includes(p) })
}

export const isTransientDbError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: unknown; code?: unknown; cause?: unknown }
  if (typeof e.code === 'string' && containsTransientPattern(e.code)) return true
  if (typeof e.message === 'string' && containsTransientPattern(e.message)) return true
  if (e.cause && typeof e.cause === 'object') {
    return isTransientDbError(e.cause)
  }
  return false
}
