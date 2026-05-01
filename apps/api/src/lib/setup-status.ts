import { sql } from 'drizzle-orm'
import type { DbClient } from '@ormod/database'
import { organization } from '@ormod/database'

/**
 * Tracks whether first-run setup is still required. The signal is
 * monotonic — once any organization exists, setup is permanently done
 * and the cache flips to `false`. After that the helper is a constant
 * `false` and never queries the database again.
 *
 * The setup route flips the cache directly on a successful create so
 * the very next session call sees the new state without an extra
 * round-trip.
 */
export interface SetupStatusTracker {
  isRequired (db: DbClient): Promise<boolean>
  markCompleted (): void
}

export const createSetupStatusTracker = (): SetupStatusTracker => {
  let completed = false

  return {
    isRequired: async (db) => {
      if (completed) return false
      const raw = await db.execute<{ count: number }>(
        sql`select count(*)::int as count from ${ organization }`,
      )
      const first = Array.isArray(raw)
        ? raw[0]
        : (raw as { rows?: unknown[] }).rows?.[0]
      const count = (first as { count?: number } | undefined)?.count ?? 0
      if (count > 0) completed = true
      return !completed
    },
    markCompleted: () => {
      completed = true
    },
  }
}
