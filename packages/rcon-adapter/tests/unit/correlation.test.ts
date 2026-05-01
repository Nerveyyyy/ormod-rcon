import { describe, it, expect, vi } from 'vitest'
import { createCorrelationTable } from '../../src/client/correlation.js'
import {
  RconOverloadError,
  RconTimeoutError,
} from '../../src/protocol/errors.js'

// Helper: register a command and attach a no-op catch so dangling
// rejections never surface as unhandled during the test run. Tests that
// care about the rejection reason still capture the promise directly.
const registerSilent = <R = unknown>(
  table: ReturnType<typeof createCorrelationTable>,
  onSend: (id: string) => void,
  cmd = 'test',
): Promise<R> => {
  const p = table.register<R>(cmd, onSend)
  p.catch(() => {})
  return p
}

describe('correlation table', () => {
  it('assigns monotonically increasing ids', () => {
    const table = createCorrelationTable()
    const ids: string[] = []
    void registerSilent(table, (id) => ids.push(id))
    void registerSilent(table, (id) => ids.push(id))
    void registerSilent(table, (id) => ids.push(id))
    expect(ids).toEqual([ '1', '2', '3' ])
    table.rejectAll(new Error('cleanup'))
  })

  it('resolves matching ids with data and returns cmd name', async () => {
    const table = createCorrelationTable()
    let capturedId = ''
    const pending = table.register<{ count: number }>('getplayers', (id) => {
      capturedId = id
    })
    const cmd = table.resolve(capturedId, { count: 5 })
    expect(cmd).toBe('getplayers')
    await expect(pending).resolves.toEqual({ count: 5 })
  })

  it('resolve returns undefined for unknown ids', () => {
    const table = createCorrelationTable()
    expect(table.resolve('999', {})).toBeUndefined()
  })

  it('rejects with RconOverloadError past the in-flight cap', async () => {
    const table = createCorrelationTable({ maxInFlight: 2 })
    const a = table.register('a', () => {})
    const b = table.register('b', () => {})
    const c = table.register('c', () => {})
    await expect(c).rejects.toBeInstanceOf(RconOverloadError)
    await expect(c).rejects.toMatchObject({ reason: 'in_flight_cap' })
    // Clean up to avoid unhandled promise warnings
    table.rejectAll(new Error('cleanup'))
    await expect(a).rejects.toThrow()
    await expect(b).rejects.toThrow()
  })

  it('rejects with RconTimeoutError after timeoutMs elapses', async () => {
    vi.useFakeTimers()
    const table = createCorrelationTable({ timeoutMs: 100 })
    const pending = table.register('slow', () => {})
    void vi.advanceTimersByTimeAsync(150)
    await expect(pending).rejects.toBeInstanceOf(RconTimeoutError)
    vi.useRealTimers()
  })

  it('rejectAll rejects every pending command', async () => {
    const table = createCorrelationTable()
    const a = table.register('a', () => {})
    const b = table.register('b', () => {})
    table.rejectAll(new Error('socket closed'))
    await expect(a).rejects.toThrow('socket closed')
    await expect(b).rejects.toThrow('socket closed')
    expect(table.size()).toBe(0)
  })

  it('rejectById returns the cmd name and removes the pending entry', () => {
    const table = createCorrelationTable()
    let idA = ''
    let idB = ''
    void registerSilent(table, (id) => {
      idA = id
    }, 'alpha')
    void registerSilent(table, (id) => {
      idB = id
    }, 'beta')
    expect(table.size()).toBe(2)
    expect(table.resolve(idA, null)).toBe('alpha')
    expect(table.size()).toBe(1)
    expect(table.rejectById(idB, new Error('x'))).toBe('beta')
    expect(table.size()).toBe(0)
    expect(table.rejectById('ghost', new Error('x'))).toBeUndefined()
  })

  it('propagates synchronous send failures', async () => {
    const table = createCorrelationTable()
    const pending = table.register('boom', () => {
      throw new Error('transport dead')
    })
    await expect(pending).rejects.toThrow('transport dead')
    expect(table.size()).toBe(0)
  })
})