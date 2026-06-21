import rateLimit from '@fastify/rate-limit'
import { createRedisClient } from '@ormod/redis'
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'

export const rateLimitOptions = (ipHeader?: string) => {
  const header = ipHeader?.toLowerCase()
  return {
    nameSpace: 'ormod-rl:',
    skipOnError: true,
    max: 600,
    timeWindow: '1 minute',
    ...(header
      ? {
          keyGenerator: (request: FastifyRequest) => {
            const value = request.headers[header]
            const first = Array.isArray(value) ? value[0] : value
            return first?.split(',')[0]?.trim() || request.ip
          },
        }
      : {}),
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const redis = createRedisClient(fastify.config.REDIS_URL, {
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
      onError: (err) => {
        fastify.log.error({ err }, 'rate-limit redis error')
      },
    })
    fastify.addHook('onClose', async () => {
      await redis.close()
    })

    await fastify.register(rateLimit, {
      redis: redis.client,
      ...rateLimitOptions(fastify.config.TRUSTED_IP_HEADER),
    })
  },
  { name: 'rate-limit' }
)
