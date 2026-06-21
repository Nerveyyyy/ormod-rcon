import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { fromNodeHeaders } from 'better-auth/node'
import { captcha } from 'better-auth/plugins'
import { authBaseOptions, authPlugins } from '@ormod/database/auth'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { isPublicPath } from './is-public-path.js'

const createAuth = (fastify: FastifyInstance) => {
  const captchaProvider = fastify.config.CAPTCHA_PROVIDER
  const captchaSecretKey = fastify.config.CAPTCHA_SECRET_KEY
  const plugins = [
    ...authPlugins,
    ...(captchaProvider && captchaSecretKey
      ? [
          captcha({
            provider: captchaProvider,
            secretKey: captchaSecretKey,
          }),
        ]
      : []),
  ]

  return betterAuth({
    ...authBaseOptions,
    database: drizzleAdapter(fastify.db, { provider: 'pg' }),
    secret: fastify.config.BETTER_AUTH_SECRET,
    baseURL: fastify.config.PUBLIC_URL,
    trustedOrigins: [fastify.config.CORS_ORIGIN, fastify.config.PUBLIC_URL],
    plugins,
  })
}

type Auth = ReturnType<typeof createAuth>

declare module 'fastify' {
  interface FastifyInstance {
    auth: Auth
  }
  interface FastifyRequest {
    user: Auth['$Infer']['Session']['user'] | null
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const auth = createAuth(fastify)
  fastify.decorate('auth', auth)

  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(
        request.url,
        `http://${request.headers.host ?? 'localhost'}`
      )
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: request.body ? JSON.stringify(request.body) : undefined,
        })
      )

      reply.status(response.status)
      response.headers.forEach((value, key) => {
        void reply.header(key, value)
      })
      return reply.send(response.body ? await response.text() : null)
    },
  })

  fastify.decorateRequest('user', null)

  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/auth/')) {
      return
    }
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })
      request.user = session?.user ?? null
    } catch (err) {
      request.log.warn({ err }, 'failed to resolve session')
    }
  })

  fastify.addHook('preHandler', async (request, reply) => {
    if (isPublicPath(request.url)) {
      return
    }
    if (!request.user) {
      return reply.unauthorized('not signed in')
    }
  })
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['database'],
})
