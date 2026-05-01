import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

/**
 * `@fastify/swagger` scans route schemas to build an OpenAPI document;
 * `@fastify/swagger-ui` serves the viewer and the JSON/YAML spec at
 * `/docs`. TypeBox schemas are native JSON Schema, so no transform is
 * required — route tags drive the grouping in the UI.
 */
const swaggerPlugin: FastifyPluginAsync = async (app) => {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ORMOD:RCON API',
        description: 'Self-hosted RCON dashboard API for ORMOD:Directive game servers.',
        version: app.appVersion,
      },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })
}

export default fp(swaggerPlugin, { name: 'swagger' })
