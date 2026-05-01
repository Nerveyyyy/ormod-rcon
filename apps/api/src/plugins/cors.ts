import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { resolveOrigins } from '../lib/origins.js'

const corsPlugin: FastifyPluginAsync = async (app) => {
  const { allowed } = resolveOrigins(app.config)
  await app.register(cors, { origin: allowed, credentials: true })
}

export default fp(corsPlugin, { name: 'cors' })
