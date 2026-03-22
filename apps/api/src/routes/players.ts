import type { FastifyPluginAsync } from 'fastify'
import { requireWrite } from '../plugins/auth.js'
import * as ctrl from '../controllers/players.js'
import { serverParams } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const steamIdParams = {
  type: 'object',
  required: ['steamId'],
  properties: { steamId: { type: 'string' } },
} as const

const playerActionParams = {
  type: 'object',
  required: ['serverName', 'steamId'],
  properties: { serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' }, steamId: { type: 'string' } },
} as const

const reasonBody = {
  type: 'object',
  additionalProperties: false,
  properties: { reason: { type: 'string', maxLength: 500 } },
} as const

const permissionsBody = {
  type: 'object',
  required: ['level'],
  additionalProperties: false,
  properties: {
    level: { type: 'string' },
    reason: { type: 'string', maxLength: 500 },
  },
} as const

const playersQuery = {
  type: 'object',
  properties: {
    filter: { type: 'string', enum: ['all', 'online'], default: 'all' },
    page: { type: 'string', default: '1' },
    limit: { type: 'string', default: '50' },
    search: { type: 'string' },
  },
} as const

const playersListResponse = {
  200: {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            steamId: { type: 'string' },
            displayName: { type: 'string' },
            online: { type: 'boolean' },
            joinedAt: { type: ['string', 'null'] },
            totalTime: { type: 'number' },
            firstSeen: { type: 'string' },
            lastSeen: { type: 'string' },
            notes: { type: ['string', 'null'] },
            kills: { type: 'number' },
            deaths: { type: 'number' },
          },
        },
      },
      page: { type: 'number' },
      limit: { type: 'number' },
      total: { type: 'number' },
    },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const playersRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/players',
    schema: { params: serverParams, querystring: playersQuery, response: playersListResponse },
    handler: ctrl.listPlayers,
  })

  app.route({
    method: 'GET',
    url: '/players/:steamId',
    schema: { params: steamIdParams },
    handler: ctrl.getPlayerHistory,
  })

  app.route({
    method: 'GET',
    url: '/players/:steamId/audit',
    schema: {
      params: steamIdParams,
      querystring: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' } } },
    },
    handler: ctrl.getPlayerAudit,
  })

  app.route({
    method: 'GET',
    url: '/players/:steamId/lists',
    schema: { params: steamIdParams },
    handler: ctrl.getPlayerLists,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/players/:steamId/kick',
    schema: { params: playerActionParams, body: reasonBody },
    preHandler: [requireWrite],
    handler: ctrl.kickPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/players/:steamId/ban',
    schema: { params: playerActionParams, body: reasonBody },
    preHandler: [requireWrite],
    handler: ctrl.banPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/players/:steamId/unban',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.unbanPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/players/:steamId/heal',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.healPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/players/:steamId/whitelist',
    schema: { params: playerActionParams },
    preHandler: [requireWrite],
    handler: ctrl.whitelistPlayer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/players/:steamId/permissions',
    schema: { params: playerActionParams, body: permissionsBody },
    preHandler: [requireWrite],
    handler: ctrl.setPlayerPermissions,
  })
}

export default playersRoutes
