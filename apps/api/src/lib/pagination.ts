import { Buffer } from 'node:buffer'
import { and, asc, desc, gt, lt, or, eq, type SQL, type AnyColumn } from 'drizzle-orm'

export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  /** The public field name as it appears in `?sort=...`. */
  field: string
  direction: SortDirection
}

/**
 * Per-endpoint declaration of the columns clients are allowed to sort
 * on. Maps a public field name → the Drizzle column. Anything not in
 * the map is rejected with `invalid_sort`.
 */
export type SortableMap = Record<string, AnyColumn>

export interface ParsedListQuery {
  cursor?: string
  limit: number
  sort: SortSpec
  includeTotal: boolean
}

export interface CursorPayload {
  /** `field:direction` — the sort the cursor was issued under. */
  sort: string
  /** Last-seen tuple `{ <field>: value, id: tieBreaker }`. */
  last: Record<string, string | number>
}

export class PaginationError extends Error {
  constructor (
    readonly code: 'invalid_sort' | 'invalid_cursor' | 'cursor_sort_mismatch',
    message: string,
  ) {
    super(message)
    this.name = 'PaginationError'
  }
}

const sortKey = (spec: SortSpec): string => {
  return `${ spec.field }:${ spec.direction }`
}

/**
 * `?sort=field` → asc, `?sort=-field` → desc, omitted → fall back to
 * the endpoint's `defaultSort`. Throws `invalid_sort` if the resolved
 * field isn't in the allow-list.
 */
export const parseSort = (
  raw: string | undefined,
  sortable: SortableMap,
  defaultSort: SortSpec,
): SortSpec => {
  if (!raw) return defaultSort
  const trimmed = raw.trim()
  if (trimmed.length === 0) return defaultSort
  const direction: SortDirection = trimmed.startsWith('-') ? 'desc' : 'asc'
  const field = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed
  if (!(field in sortable)) {
    throw new PaginationError(
      'invalid_sort',
      `unsupported sort field "${ field }"; allowed: ${ Object.keys(sortable).join(', ') }`,
    )
  }
  return { field, direction }
}

export const encodeCursor = (payload: CursorPayload): string => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export const decodeCursor = (raw: string): CursorPayload => {
  let parsed: unknown
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8')
    parsed = JSON.parse(json)
  } catch {
    throw new PaginationError('invalid_cursor', 'cursor is malformed')
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || typeof (parsed as { sort?: unknown }).sort !== 'string'
    || typeof (parsed as { last?: unknown }).last !== 'object'
    || (parsed as { last: unknown }).last === null
  ) {
    throw new PaginationError('invalid_cursor', 'cursor is malformed')
  }
  return parsed as CursorPayload
}

/**
 * Validate that a request's resolved sort matches the cursor's encoded
 * sort, then return the typed payload. A mismatch (or omitted cursor)
 * is the caller's signal that no keyset filter should be applied.
 */
export const consumeCursor = (
  raw: string | undefined,
  sort: SortSpec,
): CursorPayload | null => {
  if (!raw) return null
  const payload = decodeCursor(raw)
  if (payload.sort !== sortKey(sort)) {
    throw new PaginationError(
      'cursor_sort_mismatch',
      'cursor was issued under a different sort; restart from the first page',
    )
  }
  return payload
}

/**
 * Build the keyset WHERE clause for the next page given a sort and the
 * last-seen tuple. Composed as
 *   (sortCol, id) > (lastSort, lastId)         for asc
 *   (sortCol, id) < (lastSort, lastId)         for desc
 * which is the standard composite-key keyset pattern. Postgres handles
 * the lexicographic comparison via the OR-of-AND form below — Drizzle
 * doesn't expose row-value comparison directly, but the rewrite is
 * equivalent and uses the same index.
 */
export const keysetCondition = (
  cursor: CursorPayload,
  sort: SortSpec,
  sortColumn: AnyColumn,
  idColumn: AnyColumn,
): SQL | undefined => {
  const lastSort = cursor.last[sort.field]
  const lastId = cursor.last.id
  if (lastSort === undefined || lastId === undefined) return undefined
  const cmp = sort.direction === 'asc' ? gt : lt
  return or(
    cmp(sortColumn, lastSort),
    and(eq(sortColumn, lastSort), cmp(idColumn, lastId)),
  )
}

export const orderBy = (
  sortColumn: AnyColumn,
  idColumn: AnyColumn,
  direction: SortDirection,
): SQL[] => {
  const dir = direction === 'asc' ? asc : desc
  return [ dir(sortColumn), dir(idColumn) ]
}

export interface BuildEnvelopeArgs<TRow, TItem> {
  rows: TRow[]
  limit: number
  sort: SortSpec
  /** Map row → public-shape item. */
  toItem: (row: TRow) => TItem
  /** Pull the cursor tuple from the last row. */
  toCursorLast: (row: TRow) => Record<string, string | number>
  total?: number
}

export interface PaginatedEnvelope<T> {
  data: T[]
  has_more: boolean
  next_cursor?: string
  total?: number
}

/**
 * Convert a page of rows (queried with `limit + 1` to peek at whether
 * more exist) into the envelope shape. The last row is dropped when
 * `has_more` is true so consumers see exactly `limit` items.
 */
export const buildEnvelope = <TRow, TItem>(
  args: BuildEnvelopeArgs<TRow, TItem>,
): PaginatedEnvelope<TItem> => {
  const hasMore = args.rows.length > args.limit
  const visible = hasMore ? args.rows.slice(0, args.limit) : args.rows
  const envelope: PaginatedEnvelope<TItem> = {
    data: visible.map(args.toItem),
    has_more: hasMore,
  }
  if (hasMore && visible.length > 0) {
    const last = visible[visible.length - 1]!
    envelope.next_cursor = encodeCursor({
      sort: `${ args.sort.field }:${ args.sort.direction }`,
      last: args.toCursorLast(last),
    })
  }
  if (args.total !== undefined) envelope.total = args.total
  return envelope
}

export const wantsTotal = (include: string | undefined): boolean => {
  if (!include) return false
  return include.split(',').map((s) => { return s.trim() }).includes('total')
}
