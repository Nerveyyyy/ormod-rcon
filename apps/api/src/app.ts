import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { uuidv7 } from 'uuidv7'
import autoload from '@fastify/autoload'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import { loggerOptions } from './lib/logger.js'
import env, { autoConfig as envConfig } from './plugins/env.js'

const rootDir = dirname(fileURLToPath(import.meta.url))

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
    disableRequestLogging: true,
    connectionTimeout: 120_000,
    requestTimeout: 60_000,
    keepAliveTimeout: 10_000,
    http: {
      headersTimeout: 15_000,
    },
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id']
      if (typeof incoming === 'string' && incoming.length > 0) return incoming
      if (Array.isArray(incoming) && incoming[0]) return incoming[0]
      return uuidv7()
    },
  }).withTypeProvider<TypeBoxTypeProvider>()

  await app.register(env, envConfig())
  await app.register(autoload, {
    dir: join(rootDir, 'plugins/external'),
    options: {},
  })
  await app.register(autoload, {
    dir: join(rootDir, 'plugins/app'),
    options: {},
  })
  await app.register(autoload, {
    autoHooks: true,
    cascadeHooks: true,
    dir: join(rootDir, 'routes'),
    ignorePattern: /.*\.(controller|service)\.(ts|js)$/,
    options: {},
  })

  app.setErrorHandler((err: FastifyError, request, reply) => {
    app.log.error(
      {
        err,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          params: request.params,
        },
      },
      'Unhandled error occurred'
    )

    reply.code(err.statusCode ?? 500)

    let message = 'Internal Server Error'
    if (err.statusCode && err.statusCode < 500) {
      message = err.message
    }

    return { message }
  })

  app.setNotFoundHandler(
    {
      preHandler: app.rateLimit({
        max: 20,
        timeWindow: 1000,
      }),
    },
    (request, reply) => {
      if (
        app.serveWeb &&
        request.method === 'GET' &&
        !request.url.startsWith('/api')
      ) {
        return reply.sendFile('index.html')
      }

      request.log.warn(
        {
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            params: request.params,
          },
        },
        'Resource not found'
      )

      reply.code(404)

      return { message: 'Not Found' }
    }
  )

  return app
}
