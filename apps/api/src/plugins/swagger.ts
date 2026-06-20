import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fp from 'fastify-plugin'

export interface SwaggerOptions {
  version: string
}

export const swaggerPlugin = fp<SwaggerOptions>(async (app, opts) => {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ormod-rcon api',
        version: opts.version,
      },
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })
})
