import fp from 'fastify-plugin'
import { requestLogLevel } from '../lib/logger.js'

export default fp(
  async (app) => {
    app.addHook('onResponse', async (request, reply) => {
      const level = requestLogLevel(reply.statusCode)
      request.log[level](
        {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          durationMs: Number(reply.elapsedTime.toFixed(1)),
        },
        'request completed'
      )
    })
  },
  { name: 'request-logging' }
)
