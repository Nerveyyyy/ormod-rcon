import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'

export default fp(
  async function cookiePlugin(fastify) {
    await fastify.register(cookie)
  },
  { name: 'cookie' }
)
