import type { FastifyPluginAsync } from 'fastify'
import { requireWrite } from '../plugins/auth.js'
import * as ctrl from '../controllers/access-lists.js'
import { serverParams, listParams, listServerParams, entryParams } from './_schemas.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const listBody = {
  type: 'object',
  // AUDIT-69: 'scope' added to required so ScopeBadge never receives undefined
  required: ['name', 'type', 'scope'],
  properties: {
    // AUDIT-68: add maxLength constraints
    name: { type: 'string', minLength: 1, maxLength: 255 },
    type: { type: 'string', enum: ['BAN', 'WHITELIST', 'ADMIN'] },
    scope: { type: 'string', enum: ['GLOBAL', 'SERVER', 'EXTERNAL'] },
    description: { type: 'string', maxLength: 255 },
    externalUrl: { type: 'string', maxLength: 500 },
  },
} as const

const listUpdateBody = {
  type: 'object',
  properties: {
    // AUDIT-68: add maxLength constraints
    name: { type: 'string', minLength: 1, maxLength: 255 },
    type: { type: 'string', enum: ['BAN', 'WHITELIST', 'ADMIN'] },
    scope: { type: 'string', enum: ['GLOBAL', 'SERVER', 'EXTERNAL'] },
    description: { type: 'string', maxLength: 255 },
    externalUrl: { type: 'string', maxLength: 500 },
  },
} as const

const entryBody = {
  type: 'object',
  required: ['steamId'],
  properties: {
    steamId: { type: 'string', pattern: '^\\d{17}$' },
    // AUDIT-68: add maxLength constraints
    playerName: { type: 'string', maxLength: 255 },
    reason: { type: 'string', maxLength: 255 },
    addedBy: { type: 'string', maxLength: 255 },
    // AUDIT-70: restrict permission to valid game permission levels (prevents injection)
    permission: {
      type: 'string',
      enum: ['server', 'admin', 'operator', 'client'],
    },
    expiresAt: { type: 'string', format: 'date-time' },
  },
} as const

const assignmentsBody = {
  type: 'object',
  required: ['listIds'],
  properties: {
    listIds: { type: 'array', items: { type: 'string' } },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const accessListsRoutes: FastifyPluginAsync = async (app) => {
  // ── List CRUD ──────────────────────────────────────────────────────────────

  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/lists',
    handler: ctrl.listAccessLists,
  })

  // Create — ADMIN+
  app.route({
    method: 'POST',
    url: '/lists',
    schema: { body: listBody },
    preHandler: [requireWrite],
    handler: ctrl.createAccessList,
  })

  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/lists/:slug',
    schema: { params: listParams },
    handler: ctrl.getAccessList,
  })

  // Update — ADMIN+
  app.route({
    method: 'PUT',
    url: '/lists/:slug',
    schema: { params: listParams, body: listUpdateBody },
    preHandler: [requireWrite],
    handler: ctrl.updateAccessList,
  })

  // Delete — ADMIN+
  app.route({
    method: 'DELETE',
    url: '/lists/:slug',
    schema: { params: listParams },
    preHandler: [requireWrite],
    handler: ctrl.deleteAccessList,
  })

  // ── Entries ────────────────────────────────────────────────────────────────

  // Add entry — ADMIN+
  app.route({
    method: 'POST',
    url: '/lists/:slug/entries',
    schema: { params: listParams, body: entryBody },
    preHandler: [requireWrite],
    handler: ctrl.upsertEntry,
  })

  // Remove entry — ADMIN+
  app.route({
    method: 'DELETE',
    url: '/lists/:slug/entries/:steamId',
    schema: { params: entryParams },
    preHandler: [requireWrite],
    handler: ctrl.deleteEntry,
  })

  // ── Sync all entries to target servers ─────────────────────────────────────

  // Sync — ADMIN+
  app.route({
    method: 'POST',
    url: '/lists/:slug/sync/:serverName',
    schema: { params: listServerParams },
    preHandler: [requireWrite],
    handler: ctrl.syncToServer,
  })

  // ── External URL refresh ───────────────────────────────────────────────────

  // Refresh external feed — ADMIN+
  app.route({
    method: 'POST',
    url: '/lists/:slug/refresh',
    schema: { params: listParams },
    preHandler: [requireWrite],
    handler: ctrl.refreshExternal,
  })

  // ── Server-list assignments ────────────────────────────────────────────────

  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/servers/:serverName/list-assignments',
    schema: { params: serverParams },
    handler: ctrl.getAssignments,
  })

  // Set assignments — ADMIN+
  app.route({
    method: 'PUT',
    url: '/servers/:serverName/list-assignments',
    schema: { params: serverParams, body: assignmentsBody },
    preHandler: [requireWrite],
    handler: ctrl.setAssignments,
  })
}

export default accessListsRoutes
