import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/players.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const

const steamIdParams = {
  type: 'object',
  required: ['steamId'],
  properties: { steamId: { type: 'string' } },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const playersRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:id/players',
    schema: { params: serverParams },
    handler: ctrl.listPlayers,
  })

  app.route({
    method: 'GET',
    url: '/players/:steamId',
    schema: { params: steamIdParams },
    handler: ctrl.getPlayerHistory,
  })
}

export default playersRoutes
