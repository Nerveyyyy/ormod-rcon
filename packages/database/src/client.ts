import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

export type DbClient = ReturnType<typeof drizzle<typeof schema>>
export type PgConnection = ReturnType<typeof postgres>

export interface DatabaseHandle {
  /** Raw postgres-js connection. Call `.end()` on shutdown. */
  pg: PgConnection
  /** Drizzle client bound to the full schema. */
  db: DbClient
}

export interface CreateDbOptions {
  connectionString: string
  /** Max connections in the pool. Default: 10. */
  max?: number
  /** Idle timeout in seconds. Default: 30. */
  idleTimeout?: number
}

/**
 * Build a Postgres connection pool and a Drizzle client bound to it.
 * Issues a `select 1` to verify reachability before returning — postgres-js
 * is lazy, so without this the first real query is what blows up. Returned
 * pair is owned by the caller; closing the pool is their job.
 */
export const createDatabase = async (opts: CreateDbOptions): Promise<DatabaseHandle> => {
  const pg = postgres(opts.connectionString, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 30,
  })
  const db = drizzle(pg, { schema })

  try {
    await pg`select 1`
  } catch (err) {
    await pg.end({ timeout: 1 }).catch(() => {})
    const e = err as { code?: string, address?: string, port?: number }
    if (e.code === 'ECONNREFUSED') {
      const target = e.address && e.port ? `${ e.address }:${ e.port }` : 'database'
      throw new Error(`cannot connect to postgres at ${ target } — is it running?`)
    }
    throw err
  }

  return {
    pg,
    db,
  }
}
