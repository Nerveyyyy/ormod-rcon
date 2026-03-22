import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/events.js'
import { serverParams, paginationQuery } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const eventsQuery = {
  type: 'object',
  properties: {
    ...paginationQuery.properties,
    name: { type: 'string' },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const eventsRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/events',
    schema: { params: serverParams, querystring: eventsQuery },
    handler: ctrl.listByServer,
  })
}

export default eventsRoutes
