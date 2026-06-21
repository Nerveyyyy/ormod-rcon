import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { authBaseOptions, authPlugins } from './config.js'

// CLI-only instance for schema generation. The postgres client is lazy and
// never connects: generate reads plugin metadata, not the database.
const sql = postgres('postgres://generate:generate@127.0.0.1:5432/generate', {
  max: 1,
})

export const auth = betterAuth({
  ...authBaseOptions,
  secret: 'better-auth-cli-schema-generation-placeholder',
  database: drizzleAdapter(drizzle(sql), { provider: 'pg' }),
  plugins: authPlugins,
})
