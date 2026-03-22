import type { FastifyPluginAsync } from 'fastify'
import { requireWrite, requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/servers.js'
import { serverParams, errorResponse } from './_schemas.js'

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
const actionReply = { 200: { type: 'object', properties: { ok: { type: 'boolean' }, raw: { type: 'string' } } } } as const
const statusReply = { 200: { type: 'object', properties: { status: { type: 'string' } } } } as const

const serversRoutes: FastifyPluginAsync = async (app) => {
  app.route({ method: 'GET',    url: '/servers',
    schema: { response: listServersReply },
    handler: ctrl.listServers })

  app.route({ method: 'POST',   url: '/servers',
    schema: { body: serverBody },
    preHandler: [requireOwner],
    handler: ctrl.createServer })

  app.route({ method: 'GET',    url: '/servers/:serverName',
    schema: { params: serverParams },
    handler: ctrl.getServer })

  app.route({ method: 'PUT',    url: '/servers/:serverName',
    schema: { params: serverParams, body: serverUpdateBody },
    preHandler: [requireWrite],
    handler: ctrl.updateServer })

  app.route({ method: 'DELETE', url: '/servers/:serverName',
    schema: { params: serverParams },
    preHandler: [requireOwner],
    handler: ctrl.deleteServer })

  app.route({ method: 'POST',   url: '/servers/:serverName/start',
    schema: { params: serverParams, response: statusReply },
    preHandler: [requireWrite],
    handler: ctrl.startServer })

  app.route({ method: 'POST',   url: '/servers/:serverName/stop',
    schema: { params: serverParams, response: statusReply },
    preHandler: [requireWrite],
    handler: ctrl.stopServer })

  app.route({ method: 'POST',   url: '/servers/:serverName/restart',
    schema: { params: serverParams, response: statusReply },
    preHandler: [requireWrite],
    handler: ctrl.restartServer })

  // ── Dashboard Quick Actions ─────────────────────────────────────────────────

  app.route({ method: 'POST',   url: '/servers/:serverName/actions/forcesave',
    schema: { params: serverParams, response: actionReply },
    preHandler: [requireWrite],
    handler: ctrl.forceSave })

  app.route({ method: 'POST',   url: '/servers/:serverName/actions/announcement',
    schema: {
      params: serverParams,
      body: {
        type: 'object',
        required: ['message'],
        additionalProperties: false,
        properties: { message: { type: 'string', minLength: 1 } },
      },
      response: actionReply,
    },
    preHandler: [requireWrite],
    handler: ctrl.sendAnnouncement })

  app.route({ method: 'POST',   url: '/servers/:serverName/actions/weather',
    schema: {
      params: serverParams,
      body: {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: { type: { type: 'string' } },
      },
      response: actionReply,
    },
    preHandler: [requireWrite],
    handler: ctrl.setWeather })

  app.route({ method: 'POST',   url: '/servers/:serverName/actions/killall',
    schema: { params: serverParams, response: actionReply },
    preHandler: [requireWrite],
    handler: ctrl.killAll })

  app.route({ method: 'POST',   url: '/servers/:serverName/actions/broadcast',
    schema: {
      params: serverParams,
      body: {
        type: 'object',
        required: ['message'],
        additionalProperties: false,
        properties: { message: { type: 'string', minLength: 1 } },
      },
      response: actionReply,
    },
    preHandler: [requireWrite],
    handler: ctrl.broadcastMessage })
}

export default serversRoutes
