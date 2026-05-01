import { RconOverloadError, RconTimeoutError } from '../protocol/errors.js'

// Owns request/response correlation for in-flight commands: id assignment,
// in-flight cap, per-command timeout. Does not own connection lifecycle —
// callers decide when to rejectAll() and on which error.
//
// Per-client monotonic decimal ids — collision within one socket is
// impossible, so no UUIDs.

export interface CorrelationOptions {
  maxInFlight?: number
  timeoutMs?: number
}

export interface CorrelationTable {
  // onSend runs synchronously with the assigned id; if it throws, the pending
  // entry is removed before the rejection propagates.
  register<R> (cmd: string, onSend: (id: string) => void): Promise<R>
  resolve (id: string, data: unknown): string | undefined
  rejectById (id: string, err: Error): string | undefined
  rejectAll (err: Error): void
  size (): number
}

interface Pending {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  sentAt: number
  id: string
  cmd: string
}

export const DEFAULT_MAX_IN_FLIGHT = 64
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000

export const createCorrelationTable = (
  options: CorrelationOptions = {},
): CorrelationTable => {
  const maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  const map = new Map<string, Pending>()
  let counter = 0

  const register = <R>(
    cmd: string,
    onSend: (id: string) => void,
  ): Promise<R> => {
    if (map.size >= maxInFlight) {
      return Promise.reject(
        new RconOverloadError(
          `in-flight command cap (${ maxInFlight }) reached`,
          'in_flight_cap',
        ),
      )
    }
    counter += 1
    const id = String(counter)
    return new Promise<R>((resolve, reject) => {
      const sentAt = Date.now()
      const timer = setTimeout(() => {
        map.delete(id)
        reject(new RconTimeoutError(id, Date.now() - sentAt))
      }, timeoutMs)
      map.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
        sentAt,
        id,
        cmd,
      })
      try {
        onSend(id)
      } catch (err) {
        clearTimeout(timer)
        map.delete(id)
        reject(err as Error)
      }
    })
  }

  const resolve = (id: string, data: unknown): string | undefined => {
    const pending = map.get(id)
    if (pending === undefined) {
      return undefined
    }
    clearTimeout(pending.timer)
    map.delete(id)
    pending.resolve(data)
    return pending.cmd
  }

  const rejectById = (id: string, err: Error): string | undefined => {
    const pending = map.get(id)
    if (pending === undefined) {
      return undefined
    }
    clearTimeout(pending.timer)
    map.delete(id)
    pending.reject(err)
    return pending.cmd
  }

  const rejectAll = (err: Error): void => {
    for (const pending of map.values()) {
      clearTimeout(pending.timer)
      pending.reject(err)
    }
    map.clear()
  }

  return {
    register,
    resolve,
    rejectById,
    rejectAll,
    size: () => map.size,
  }
}