import fp from 'fastify-plugin'
import fastifyEnv from '@fastify/env'
import { envSchema } from '../config.js'

export default fp(
  async function envPlugin(fastify) {
    await fastify.register(fastifyEnv, {
      schema: envSchema,
      dotenv: { path: '../../.env' },
    })

    // Safety check: always require a real secret (not just in production)
    const secret = fastify.config.BETTER_AUTH_SECRET
    if (!secret || secret === 'change_this_to_something_very_random_and_long') {
      throw new Error(
        '[FATAL] BETTER_AUTH_SECRET must be set to a unique value (min 32 chars). Run: openssl rand -hex 32'
      )
    }
  },
  { name: 'env', dependencies: ['sensible'] }
)
