import type { FastifyPluginAsync } from 'fastify'
import { requireWrite } from '../plugins/auth.js'
import * as ctrl from '../controllers/settings.js'
import { serverParams } from './_schemas.js'

const settingKeyParams = {
  type: 'object',
  required: ['serverName', 'key'],
  properties: {
    serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
    key: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]*$' },
  },
} as const

const settingKeyBody = {
  type: 'object',
  required: ['value'],
  properties: { value: {} },
} as const

const bulkSettingsBody = {
  type: 'object',
  required: ['changes'],
  additionalProperties: false,
  properties: {
    changes: {
      type: 'object',
      additionalProperties: {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      },
    },
  },
} as const

const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/settings',
    schema: { params: serverParams },
    handler: ctrl.getSettings,
  })

  app.route({
    method: 'PUT',
    url: '/servers/:serverName/settings/:key',
    schema: { params: settingKeyParams, body: settingKeyBody },
    preHandler: [requireWrite],
    handler: ctrl.updateSettingKey,
  })

  app.route({
    method: 'PUT',
    url: '/servers/:serverName/settings',
    schema: { params: serverParams, body: bulkSettingsBody },
    preHandler: [requireWrite],
    handler: ctrl.bulkUpdateSettings,
  })
}

export default settingsRoutes
