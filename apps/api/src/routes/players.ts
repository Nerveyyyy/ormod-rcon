import type { FastifyPluginAsync } from 'fastify'
import { requireWrite } from '../plugins/auth.js'
import * as ctrl from '../controllers/players.js'
import { serverParams as sharedServerParams } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

// AUDIT-96: use shared serverParams from _schemas.ts
const serverParams = sharedServerParams

const steamIdParams = {
  type: 'object',
  required: ['steamId'],
  properties: { steamId: { type: 'string' } },
} as const

const playerActionParams = {
  type: 'object',
  required: ['id', 'steamId'],
  properties: { id: { type: 'string' }, steamId: { type: 'string' } },
} as const

const permissionsBody = {
  type: 'object',
  required: ['level'],
  additionalProperties: false,
  properties: { level: { type: 'string' } },
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

  app.route({
    method: 'POST',
    url: '/servers/:id/players/:steamId/kick',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.kickPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/players/:steamId/ban',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.banPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/players/:steamId/unban',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.unbanPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/players/:steamId/heal',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.healPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/players/:steamId/whitelist',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.whitelistPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/players/:steamId/permissions',
    schema: { params: playerActionParams, body: permissionsBody },
    preHandler: [requireWrite],
    handler: ctrl.setPlayerPermissions,
  })
}

export default playersRoutes
