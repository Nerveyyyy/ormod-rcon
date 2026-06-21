import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url)
)

export const runMigrations = async (
  connectionString: string
): Promise<void> => {
  const sql = postgres(connectionString, { max: 1 })
  try {
    await migrate(drizzle(sql), { migrationsFolder })
  } finally {
    await sql.end()
  }
}
