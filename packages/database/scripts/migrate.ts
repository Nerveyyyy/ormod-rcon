import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const here = fileURLToPath(new URL('.', import.meta.url))

try {
  process.loadEnvFile(resolve(here, '..', '..', '..', '.env'))
} catch {
  // No repo-root .env — fall through to ambient env (CI, container, etc).
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pg = postgres(url, {
  max: 1,
  onnotice: () => {},
})
const db = drizzle(pg)

try {
  await migrate(db, {
    migrationsFolder: resolve(here, '..', 'migrations'),
  })
  console.log('migrations applied')
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await pg.end({ timeout: 5 })
}
