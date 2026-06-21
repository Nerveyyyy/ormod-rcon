import { createAuth, fromNodeHeaders, type Auth } from '@ormod/auth'
import { createRedisClient } from '@ormod/redis'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { isPublicPath } from './is-public-path.js'

declare module 'fastify' {
  interface FastifyInstance {
    auth: Auth
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const captchaProvider = fastify.config.CAPTCHA_PROVIDER
  const captchaSecretKey = fastify.config.CAPTCHA_SECRET_KEY

  const redis = createRedisClient(fastify.config.REDIS_URL, {
    onError: (err) => {
      fastify.log.error({ err }, 'redis client error')
    },
  })
  fastify.addHook('onClose', async () => {
    await redis.close()
  })

  const auth = createAuth({
    db: fastify.db,
    secret: fastify.config.BETTER_AUTH_SECRET,
    baseURL: fastify.config.PUBLIC_URL,
    trustedOrigins: [
      fastify.config.PUBLIC_URL,
      ...(fastify.config.WEB_ORIGIN ? [fastify.config.WEB_ORIGIN] : []),
    ],
    redisClient: redis.client,
    ipAddressHeader: fastify.config.TRUSTED_IP_HEADER,
    captcha:
      captchaProvider && captchaSecretKey
        ? { provider: captchaProvider, secretKey: captchaSecretKey }
        : undefined,
  })
  fastify.decorate('auth', auth)

  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, fastify.config.PUBLIC_URL)
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: request.body ? JSON.stringify(request.body) : undefined,
        })
      )

      reply.status(response.status)
      const setCookies = response.headers.getSetCookie()
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') {
          void reply.header(key, value)
        }
      })
      if (setCookies.length > 0) {
        void reply.header('set-cookie', setCookies)
      }
      return reply.send(response.body ? await response.text() : null)
    },
  })

  fastify.addHook('onRequest', async (request) => {
    if (isPublicPath(request.url)) {
      return
    }
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })
      if (session) {
        request.requestContext.set('user', session.user)
        request.requestContext.set('sessionId', session.session.id)
      }
    } catch (err) {
      request.log.warn({ err }, 'failed to resolve session')
    }
  })

  fastify.addHook('preHandler', async (request, reply) => {
    if (isPublicPath(request.url)) {
      return
    }
    if (!request.requestContext.get('user')) {
      return reply.unauthorized('not signed in')
    }
  })
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['database'],
})
