import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    serveWeb: boolean
  }
}

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../web')

export default fp(
  async (fastify) => {
    const present = existsSync(webDir)
    fastify.decorate('serveWeb', present)
    if (!present) return

    await fastify.register(fastifyStatic, {
      root: webDir,
      wildcard: false,
    })
  },
  { name: 'static' }
)
