import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/arena.js'
import { serverParams, paginationQuery } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const matchParams = {
  type: 'object',
  properties: {
    serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
    matchId: { type: 'string' },
  },
  required: ['serverName', 'matchId'],
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const arenaRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/arena/matches',
    schema: { params: serverParams, querystring: paginationQuery },
    handler: ctrl.listMatches,
  })

  app.route({
    method: 'GET',
    url: '/servers/:serverName/arena/matches/:matchId',
    schema: { params: matchParams },
    handler: ctrl.getMatch,
  })
}

export default arenaRoutes
