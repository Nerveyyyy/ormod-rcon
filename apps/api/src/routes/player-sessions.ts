import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/player-sessions.js'
import { serverParams, paginationQuery } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const sessionQuery = {
  type: 'object',
  properties: {
    ...paginationQuery.properties,
    steamId: { type: 'string' },
    active:  { type: 'string', enum: ['true', 'false'] },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const playerSessionsRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/sessions',
    schema: { params: serverParams, querystring: sessionQuery },
    handler: ctrl.listByServer,
  })
}

export default playerSessionsRoutes
