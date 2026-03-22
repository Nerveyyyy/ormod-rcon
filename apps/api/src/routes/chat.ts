import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/chat.js'
import { serverParams, paginationQuery } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const chatQuery = {
  type: 'object',
  properties: {
    ...paginationQuery.properties,
    channel: { type: 'string', enum: ['global', 'team', 'local'] },
    steamId: { type: 'string' },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const chatRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/chat',
    schema: { params: serverParams, querystring: chatQuery },
    handler: ctrl.listByServer,
  })
}

export default chatRoutes
