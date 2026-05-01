import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit invokes this file directly, so load the repo-root .env
// here — the equivalent of the --env-file flag the API's tsx scripts
// pass. Pre-existing process env wins, so CI pipelines that inject
// DATABASE_URL continue to work.
const here = fileURLToPath(new URL('.', import.meta.url))
try {
  process.loadEnvFile(resolve(here, '..', '..', '.env'))
} catch {
  // No .env at the root — fall through and rely on process.env.
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
