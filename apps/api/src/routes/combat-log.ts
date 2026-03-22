import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/combat-log.js'
import { serverParams, paginationQuery } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const combatLogQuery = {
  type: 'object',
  properties: {
    ...paginationQuery.properties,
    steamId: { type: 'string' },
    type: { type: 'string', enum: ['pvp', 'pve', 'all'] },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const combatLogRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/combat-log',
    schema: { params: serverParams, querystring: combatLogQuery },
    handler: ctrl.listByServer,
  })
}

export default combatLogRoutes
