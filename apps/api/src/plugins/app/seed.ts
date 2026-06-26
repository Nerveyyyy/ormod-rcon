import { SEEDED_OWNER_EMAIL, seedOwner } from '@ormod/auth'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

const seedPlugin: FastifyPluginAsync = async (fastify) => {
  const seeded = await seedOwner(
    fastify.auth,
    fastify.db,
    fastify.config.OWNER_PASSWORD
  )
  if (seeded) {
    fastify.log.info(
      { email: SEEDED_OWNER_EMAIL },
      'seeded owner account; sign in and change the password'
    )
  }
  if (fastify.config.OWNER_PASSWORD === 'changeme') {
    fastify.log.warn(
      'OWNER_PASSWORD is the published default; set a strong value and restart'
    )
  }
}

export default fp(seedPlugin, {
  name: 'seed',
  dependencies: ['database', 'auth'],
})
