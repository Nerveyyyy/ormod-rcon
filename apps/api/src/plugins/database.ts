import fp from 'fastify-plugin'
import prisma from '../db/prisma-client.js'

export default fp(
  async function databasePlugin(fastify) {
    fastify.addHook('onClose', async () => {
      await prisma.$disconnect()
    })
  },
  { name: 'database' }
)
