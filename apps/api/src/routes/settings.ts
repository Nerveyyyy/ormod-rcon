import type { FastifyPluginAsync } from 'fastify'
import { requireWrite } from '../plugins/auth.js'
import * as ctrl from '../controllers/settings.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const

const settingKeyParams = {
  type: 'object',
  required: ['id', 'key'],
  properties: {
    id: { type: 'string' },
    key: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]*$' },
  },
} as const

const settingKeyBody = {
  type: 'object',
  required: ['value'],
  properties: { value: {} }, // any JSON value
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const settingsRoutes: FastifyPluginAsync = async (app) => {
  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/servers/:id/settings',
    schema: { params: serverParams },
    handler: ctrl.getSettings,
  })

  // Replace entire settings — ADMIN+
  app.route({
    method: 'PUT',
    url: '/servers/:id/settings',
    schema: { params: serverParams, body: { type: 'object', additionalProperties: true } },
    preHandler: [requireWrite],
    handler: ctrl.replaceSettings,
  })

  // Update single key — ADMIN+
  app.route({
    method: 'PUT',
    url: '/servers/:id/settings/:key',
    schema: { params: settingKeyParams, body: settingKeyBody },
    preHandler: [requireWrite],
    handler: ctrl.updateSettingKey,
  })
}

export default settingsRoutes
