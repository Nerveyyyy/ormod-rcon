import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/presence.js'
import { serverParams } from './_schemas.js'

const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/presence/:serverName',
    schema: { params: serverParams },
    handler: ctrl.getPresence,
  })
}

export default presenceRoutes
