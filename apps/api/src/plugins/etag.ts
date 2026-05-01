import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import etag from '@fastify/etag'

const etagPlugin: FastifyPluginAsync = async (app) => {
  await app.register(etag)
}

export default fp(etagPlugin, { name: 'etag' })
