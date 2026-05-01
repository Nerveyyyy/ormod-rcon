import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { fastifyRequestContext } from '@fastify/request-context'
import '../types.js'

/**
 * Registers `@fastify/request-context` with the canonical default
 * shape. `defaultStoreValues` is the static form (not a factory) so
 * `strictNullChecks` lets callers of `requestContext.get(...)` see
 * `T | null` instead of `T | null | undefined`. The auth plugin owns
 * all writes — this file just establishes the store.
 */
const requestContextPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyRequestContext, {
    defaultStoreValues: {
      user: null,
      tenantId: null,
      sessionId: null,
    },
  })
}

export default fp(requestContextPlugin, { name: 'request-context' })
