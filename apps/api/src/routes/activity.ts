import type { FastifyPluginAsync } from 'fastify'
import * as ctrl from '../controllers/activity.js'
import { serverParams } from './_schemas.js'

const activityRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/servers/:serverName/activity-stats',
    schema: { params: serverParams },
    handler: ctrl.getActivityStats,
  })
}

export default activityRoutes
