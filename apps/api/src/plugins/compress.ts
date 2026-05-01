import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import compress from '@fastify/compress'

const compressPlugin: FastifyPluginAsync = async (app) => {
  await app.register(compress)
}

export default fp(compressPlugin, { name: 'compress' })
