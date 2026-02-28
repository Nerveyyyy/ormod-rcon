import type { FastifyPluginAsync } from 'fastify'
import { listCapabilities } from '../controllers/capabilities.js'

// ── Routes ───────────────────────────────────────────────────────────────────

const capabilitiesRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/capabilities',
    handler: (req) => listCapabilities(req.server.config),
  })
}

export default capabilitiesRoutes
