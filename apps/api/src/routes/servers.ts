import type { FastifyPluginAsync } from 'fastify'
import { requireWrite, requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/servers.js'
import { serverParams as sharedServerParams } from './_schemas.js'

const serverParams = sharedServerParams

const serverBody = {
  type: 'object',
  required: ['name', 'serverName'],
  additionalProperties: false,
  properties: {
    name:          { type: 'string', maxLength: 255 },
    serverName:    { type: 'string', maxLength: 255 },
    containerName: { type: 'string', nullable: true, minLength: 1, maxLength: 255,
                     pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
    gamePort:      { type: 'number' },
    queryPort:     { type: 'number' },
    notes:         { type: 'string', maxLength: 255 },
  },
} as const

const serverUpdateBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name:          { type: 'string', maxLength: 255 },
    serverName:    { type: 'string', maxLength: 255 },
    containerName: { type: 'string', nullable: true, minLength: 1, maxLength: 255,
                     pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
    gamePort:      { type: 'number' },
    queryPort:     { type: 'number' },
    notes:         { type: 'string', maxLength: 255 },
  },
} as const

const serverItem = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id:            { type: 'string' },
    name:          { type: 'string' },
    serverName:    { type: 'string' },
    containerName: { type: ['string', 'null'] },
    mode:          { type: 'string' },
    gamePort:      { type: 'number' },
    queryPort:     { type: 'number' },
    notes:         { type: ['string', 'null'] },
    createdAt:     { type: 'string' },
    running:       { type: 'boolean' },
  },
} as const

const listServersReply = { 200: { type: 'array', items: serverItem } } as const

const serversRoutes: FastifyPluginAsync = async (app) => {
  app.route({ method: 'GET',    url: '/servers',
    schema: { response: listServersReply },
    handler: ctrl.listServers })

  app.route({ method: 'POST',   url: '/servers',
    schema: { body: serverBody },
    preHandler: [requireOwner],
    handler: ctrl.createServer })

  app.route({ method: 'GET',    url: '/servers/:id',
    schema: { params: serverParams },
    handler: ctrl.getServer })

  app.route({ method: 'PUT',    url: '/servers/:id',
    schema: { params: serverParams, body: serverUpdateBody },
    preHandler: [requireWrite],
    handler: ctrl.updateServer })

  app.route({ method: 'DELETE', url: '/servers/:id',
    schema: { params: serverParams },
    preHandler: [requireOwner],
    handler: ctrl.deleteServer })

  app.route({ method: 'POST',   url: '/servers/:id/start',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.startServer })

  app.route({ method: 'POST',   url: '/servers/:id/stop',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.stopServer })

  app.route({ method: 'POST',   url: '/servers/:id/restart',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.restartServer })

  // ── Dashboard Quick Actions ─────────────────────────────────────────────────

  app.route({ method: 'POST',   url: '/servers/:id/actions/forcesave',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.forceSave })

  app.route({ method: 'POST',   url: '/servers/:id/actions/announcement',
    schema: {
      params: serverParams,
      body: {
        type: 'object',
        required: ['message'],
        additionalProperties: false,
        properties: { message: { type: 'string', minLength: 1 } },
      },
    },
    preHandler: [requireWrite],
    handler: ctrl.sendAnnouncement })

  app.route({ method: 'POST',   url: '/servers/:id/actions/weather',
    schema: {
      params: serverParams,
      body: {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: { type: { type: 'string' } },
      },
    },
    preHandler: [requireWrite],
    handler: ctrl.setWeather })

  app.route({ method: 'POST',   url: '/servers/:id/actions/killall',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.killAll })

  app.route({ method: 'POST',   url: '/servers/:id/actions/broadcast',
    schema: {
      params: serverParams,
      body: {
        type: 'object',
        required: ['message'],
        additionalProperties: false,
        properties: { message: { type: 'string', minLength: 1 } },
      },
    },
    preHandler: [requireWrite],
    handler: ctrl.broadcastMessage })
}

export default serversRoutes
