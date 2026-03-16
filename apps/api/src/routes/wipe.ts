import type { FastifyPluginAsync } from 'fastify'
import { requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/wipe.js'
import { serverParams as sharedServerParams } from './_schemas.js'

const serverParams = sharedServerParams

const wipeLogParams = {
  type: 'object',
  required: ['id', 'wipeId'],
  properties: {
    id:     { type: 'string' },
    wipeId: { type: 'string' },
  },
} as const

const wipeBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    notes: { type: 'string', maxLength: 255 },
  },
} as const

const wipeRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:id/wipes',
    schema: { params: serverParams },
    handler: ctrl.listWipes,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/wipe',
    schema: { params: serverParams, body: wipeBody },
    preHandler: [requireOwner],
    handler: ctrl.executeWipe,
  })

  app.route({
    method: 'GET',
    url: '/servers/:id/wipes/:wipeId',
    schema: { params: wipeLogParams },
    handler: ctrl.getWipeLog,
  })
}

export default wipeRoutes
