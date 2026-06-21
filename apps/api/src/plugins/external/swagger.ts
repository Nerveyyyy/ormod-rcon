import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fp from 'fastify-plugin'
import { version } from '../../lib/version.js'

export default fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'ORMOD:RCON API',
          description:
            'Self-hosted RCON dashboard API for ORMOD:Directive game servers.',
          version,
        },
      },
    })

    await fastify.register(swaggerUi, { routePrefix: '/docs', staticCSP: true })
  },
  { name: 'swagger' }
)
