import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { buildErrorHandler } from '../lib/error-handler.js'

/**
 * Installs the app-wide Fastify error handler. Declared after
 * request-context so that anything the handler logs can safely read
 * context values (the handler doesn't today, but the ordering keeps
 * it option-open and matches where every other plugin expects
 * context to already exist).
 */
const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler(buildErrorHandler({ config: app.config }))
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  dependencies: [ 'request-context' ],
})
