import cors from '@fastify/cors'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import Fastify, { type FastifyInstance } from 'fastify'

import type { Config } from './config.js'
import { swaggerPlugin } from './plugins/swagger.js'
import { healthRoutes } from './routes/health.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
  }
}

export function buildServer(config: Config): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions(config),
  }).withTypeProvider<TypeBoxTypeProvider>()

  app.decorate('config', config)

  app.register(cors, { origin: config.corsOrigin })
  app.register(swaggerPlugin, { version: config.version })
  app.register(healthRoutes)

  return app
}

function loggerOptions(config: Config): Record<string, unknown> {
  if (config.nodeEnv === 'production') {
    return { level: config.logLevel }
  }

  return {
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }
}
