import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/setup.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const setupBody = {
  type: 'object',
  required: ['name', 'email', 'password'],
  properties: {
    // AUDIT-68: add maxLength constraints
    name: { type: 'string', minLength: 1, maxLength: 255 },
    email: { type: 'string', format: 'email', maxLength: 255 },
    password: { type: 'string', minLength: 8, maxLength: 255 },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const setupRoutes: FastifyPluginAsync = async (app) => {
  // Bootstrap: single call for session + setup check
  app.route({
    method: 'GET',
    url: '/me',
    handler: ctrl.getBootstrapSession,
  })

  // Check if first-run setup is required
  app.route({
    method: 'GET',
    url: '/setup',
    handler: ctrl.checkSetup,
  })

  // Create initial OWNER account (disabled once any user exists)
  app.route({
    method: 'POST',
    url: '/setup',
    schema: { body: setupBody },
    handler: ctrl.createOwner,
  })
}

export default setupRoutes
