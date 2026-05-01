import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'

const helmetPlugin: FastifyPluginAsync = async (app) => {
  // CSP is disabled because the dashboard bundles inline assets the
  // default policy would reject. Self-hosters running behind a hardened
  // reverse proxy can layer their own CSP there.
  await app.register(helmet, { contentSecurityPolicy: false })
}

export default fp(helmetPlugin, { name: 'helmet' })
