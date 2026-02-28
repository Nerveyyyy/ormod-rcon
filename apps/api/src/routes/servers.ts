import type { FastifyPluginAsync } from 'fastify'
import { requireWrite, requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/servers.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const

const serverBody = {
  type: 'object',
  required: ['name', 'serverName', 'savePath'],
  properties: {
    name: { type: 'string' },
    serverName: { type: 'string' },
    savePath: { type: 'string' },
    containerName: {
      type: 'string',
      nullable: true,
      minLength: 1,
      maxLength: 255,
      pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$',
    },
    executablePath: { type: 'string' },
    gamePort: { type: 'number' },
    queryPort: { type: 'number' },
    notes: { type: 'string' },
  },
} as const

const serverUpdateBody = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    serverName: { type: 'string' },
    savePath: { type: 'string' },
    containerName: {
      type: 'string',
      nullable: true,
      minLength: 1,
      maxLength: 255,
      pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$',
    },
    executablePath: { type: 'string' },
    gamePort: { type: 'number' },
    queryPort: { type: 'number' },
    notes: { type: 'string' },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const serversRoutes: FastifyPluginAsync = async (app) => {
  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/servers',
    handler: ctrl.listServers,
  })

  // Create — OWNER only
  app.route({
    method: 'POST',
    url: '/servers',
    schema: { body: serverBody },
    preHandler: [requireOwner],
    handler: ctrl.createServer,
  })

  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/servers/:id',
    schema: { params: serverParams },
    handler: ctrl.getServer,
  })

  // Update — ADMIN+
  app.route({
    method: 'PUT',
    url: '/servers/:id',
    schema: { params: serverParams, body: serverUpdateBody },
    preHandler: [requireWrite],
    handler: ctrl.updateServer,
  })

  // Delete — OWNER only
  app.route({
    method: 'DELETE',
    url: '/servers/:id',
    schema: { params: serverParams },
    preHandler: [requireOwner],
    handler: ctrl.deleteServer,
  })

  // Start/stop/restart — ADMIN+
  app.route({
    method: 'POST',
    url: '/servers/:id/start',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.startServer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/stop',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.stopServer,
  })

  app.route({
    method: 'POST',
    url: '/servers/:id/restart',
    schema: { params: serverParams },
    preHandler: [requireWrite],
    handler: ctrl.restartServer,
  })
}

export default serversRoutes
