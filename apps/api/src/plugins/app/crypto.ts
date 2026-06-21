import {
  createSingleKeyEncrypter,
  loadMasterKeyFromEnv,
  type SecretEncrypter,
} from '@ormod/database/crypto'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    encrypter: SecretEncrypter
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const key = loadMasterKeyFromEnv(fastify.config.ORMOD_SECRET_KEY)
    fastify.decorate('encrypter', createSingleKeyEncrypter(key))
  },
  { name: 'crypto' }
)
