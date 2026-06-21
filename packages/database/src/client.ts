import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

export type DbClient = ReturnType<typeof drizzle<typeof schema>>
export type PgConnection = ReturnType<typeof postgres>

export interface DatabaseHandle {
  pg: PgConnection
  db: DbClient
}

export interface CreateDbOptions {
  connectionString: string
  max?: number
  idleTimeout?: number
}

export const createDatabase = async (
  opts: CreateDbOptions
): Promise<DatabaseHandle> => {
  const pg = postgres(opts.connectionString, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 30,
  })
  const db = drizzle(pg, { schema })

  try {
    await pg`select 1`
  } catch (err) {
    await pg.end({ timeout: 1 }).catch(() => {})
    const e = err as { code?: string; address?: string; port?: number }
    if (e.code === 'ECONNREFUSED') {
      const target = e.address && e.port ? `${e.address}:${e.port}` : 'database'
      throw new Error(
        `cannot connect to postgres at ${target} (is it running?)`
      )
    }
    throw err
  }

  return { pg, db }
}
