// Pino-compatible logger surface. The README points consumers here.

export type LogFields = Record<string, unknown>

export interface Logger {
  trace (fields: LogFields | string, message?: string): void
  debug (fields: LogFields | string, message?: string): void
  info (fields: LogFields | string, message?: string): void
  warn (fields: LogFields | string, message?: string): void
  error (fields: LogFields | string, message?: string): void
  child (fields: LogFields): Logger
}

const noop = (): void => {}

export const createNoopLogger = (): Logger => {
  const instance: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => instance,
  }
  return instance
}
