import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'

export const autoConfig = (fastify: FastifyInstance) => {
  const origin = [fastify.config.PUBLIC_URL]
  if (fastify.config.WEB_ORIGIN) {
    origin.push(fastify.config.WEB_ORIGIN)
  }
  return {
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  }
}

export default cors
