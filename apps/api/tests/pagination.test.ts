import { describe, it, expect } from 'vitest'
import {
  buildEnvelope,
  consumeCursor,
  decodeCursor,
  encodeCursor,
  parseSort,
  PaginationError,
  wantsTotal,
  type SortableMap,
} from '../src/lib/pagination.js'

// Stub columns — the helpers we exercise here don't run any SQL, they
// just route field names. Casting to `any` is fine in the test scope.
const sortable: SortableMap = {
  createdAt: {} as never,
  name: {} as never,
  handle: {} as never,
}

const defaultSort = { field: 'createdAt', direction: 'desc' as const }

describe('parseSort', () => {
  it('falls back to the default when the param is omitted', () => {
    expect(parseSort(undefined, sortable, defaultSort)).toEqual(defaultSort)
    expect(parseSort('', sortable, defaultSort)).toEqual(defaultSort)
  })

  it('parses ascending and descending forms', () => {
    expect(parseSort('name', sortable, defaultSort)).toEqual({
      field: 'name',
      direction: 'asc',
    })
    expect(parseSort('-name', sortable, defaultSort)).toEqual({
      field: 'name',
      direction: 'desc',
    })
  })

  it('throws invalid_sort for fields outside the allow-list', () => {
    try {
      parseSort('password', sortable, defaultSort)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(PaginationError)
      expect((err as PaginationError).code).toBe('invalid_sort')
    }
  })
})

describe('cursor round-trip', () => {
  const payload = {
    sort: 'createdAt:desc',
    last: { createdAt: '2026-04-24T00:00:00.000Z', id: 'abc' },
  }

  it('survives encode + decode', () => {
    const enc = encodeCursor(payload)
    expect(typeof enc).toBe('string')
    expect(decodeCursor(enc)).toEqual(payload)
  })

  it('rejects malformed cursors', () => {
    try {
      decodeCursor('not-a-real-cursor!!!')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(PaginationError)
      expect((err as PaginationError).code).toBe('invalid_cursor')
    }
  })

  it('rejects cursor when the request sort no longer matches', () => {
    const enc = encodeCursor(payload)
    try {
      consumeCursor(enc, { field: 'name', direction: 'asc' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(PaginationError)
      expect((err as PaginationError).code).toBe('cursor_sort_mismatch')
    }
  })

  it('returns null for an absent cursor', () => {
    expect(consumeCursor(undefined, defaultSort)).toBeNull()
  })
})

describe('buildEnvelope', () => {
  const rows = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
    { id: 'c', name: 'Charlie' },
  ]

  it('marks has_more and trims the peek row when the page is full', () => {
    const env = buildEnvelope({
      rows,
      limit: 2,
      sort: { field: 'name', direction: 'asc' },
      toItem: (r) => { return r },
      toCursorLast: (r) => { return { name: r.name, id: r.id } },
    })
    expect(env.data).toHaveLength(2)
    expect(env.has_more).toBe(true)
    expect(env.next_cursor).toBeDefined()
    const decoded = decodeCursor(env.next_cursor!)
    expect(decoded.sort).toBe('name:asc')
    expect(decoded.last).toEqual({ name: 'Bravo', id: 'b' })
  })

  it('omits next_cursor when has_more is false', () => {
    const env = buildEnvelope({
      rows,
      limit: 5,
      sort: { field: 'name', direction: 'asc' },
      toItem: (r) => { return r },
      toCursorLast: (r) => { return { name: r.name, id: r.id } },
    })
    expect(env.data).toHaveLength(3)
    expect(env.has_more).toBe(false)
    expect(env.next_cursor).toBeUndefined()
  })

  it('includes total only when supplied', () => {
    const env = buildEnvelope({
      rows: [],
      limit: 10,
      sort: defaultSort,
      toItem: (r) => { return r },
      toCursorLast: () => { return { id: '' } },
      total: 42,
    })
    expect(env.total).toBe(42)
    expect(env.has_more).toBe(false)
  })
})

describe('wantsTotal', () => {
  it('returns true only when "total" appears in include list', () => {
    expect(wantsTotal(undefined)).toBe(false)
    expect(wantsTotal('')).toBe(false)
    expect(wantsTotal('total')).toBe(true)
    expect(wantsTotal('foo,total,bar')).toBe(true)
    expect(wantsTotal('totals')).toBe(false)
  })
})
