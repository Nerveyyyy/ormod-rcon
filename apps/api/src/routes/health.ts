import { Type } from '@fastify/type-provider-typebox'
import type { FastifyInstance } from 'fastify'

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  uptime: Type.Number(),
  version: Type.String(),
})

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        summary: 'Liveness probe',
        tags: ['system'],
        response: {
          200: HealthResponse,
        },
      },
    },
    async () => {
      return {
        status: 'ok' as const,
        uptime: process.uptime(),
        version: app.config.version,
      }
    }
  )
}
