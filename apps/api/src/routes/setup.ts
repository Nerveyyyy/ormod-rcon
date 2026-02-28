import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/setup.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const setupBody = {
  type: 'object',
  required: ['name', 'email', 'password'],
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const setupRoutes: FastifyPluginAsync = async (app) => {
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
