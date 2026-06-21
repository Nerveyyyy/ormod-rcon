import {
  type FastifyPluginAsyncTypebox,
  Type,
} from '@fastify/type-provider-typebox'
import { version } from '../lib/version.js'

const health: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: Type.Object({
            status: Type.Literal('ok'),
            uptime: Type.Number(),
            version: Type.String(),
          }),
        },
        tags: ['system'],
      },
    },
    async () => {
      return {
        status: 'ok' as const,
        uptime: process.uptime(),
        version,
      }
    }
  )
}

export default health
