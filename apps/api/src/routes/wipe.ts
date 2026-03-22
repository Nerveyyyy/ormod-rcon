import type { FastifyPluginAsync } from 'fastify'
import { requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/wipe.js'
import { serverParams } from './_schemas.js'

const wipeLogParams = {
  type: 'object',
  required: ['serverName', 'wipeId'],
  properties: {
    serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
    wipeId:     { type: 'string' },
  },
} as const

const wipeBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    notes: { type: 'string', maxLength: 255 },
    type: { type: 'string', enum: ['full', 'map', 'playerdata'] },
    targetSteamId: { type: 'string' },
  },
} as const

const wipeRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/wipes',
    schema: { params: serverParams },
    handler: ctrl.listWipes,
  })

  app.route({
    method: 'POST',
    url: '/servers/:serverName/wipe',
    schema: { params: serverParams, body: wipeBody },
    preHandler: [requireOwner],
    handler: ctrl.executeWipe,
  })

  app.route({
    method: 'GET',
    url: '/servers/:serverName/wipes/:wipeId',
    schema: { params: wipeLogParams },
    handler: ctrl.getWipeLog,
  })
}

export default wipeRoutes
