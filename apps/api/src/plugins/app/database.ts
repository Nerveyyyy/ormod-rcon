import {
  createDatabase,
  type CreateDbOptions,
  type DbClient,
} from '@ormod/database'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient
  }
}

export const autoConfig = (fastify: FastifyInstance) => {
  return {
    connectionString: fastify.config.DATABASE_URL,
  }
}

export default fp<CreateDbOptions>(
  async (fastify, opts) => {
    const { db, pg } = await createDatabase(opts)
    fastify.decorate('db', db)
    fastify.addHook('onClose', async () => {
      await pg.end()
    })
  },
  { name: 'database' }
)
