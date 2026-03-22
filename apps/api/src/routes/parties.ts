import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/parties.js'
import { serverParams, paginationQuery } from './_schemas.js'

// ── Routes ───────────────────────────────────────────────────────────────────

const partiesRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/parties',
    schema: { params: serverParams, querystring: paginationQuery },
    handler: ctrl.listByServer,
  })
}

export default partiesRoutes
