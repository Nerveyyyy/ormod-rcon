import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'

const cookiePlugin: FastifyPluginAsync = async (app) => {
  await app.register(cookie)
}

export default fp(cookiePlugin, { name: 'cookie' })
