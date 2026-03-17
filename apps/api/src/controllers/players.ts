import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'

export async function listPlayers(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand('getplayers')

    // Update lastSeen for any known DB players when this command is called.
    // Full parsing deferred until the game's response format is confirmed.
    await prisma.playerRecord.updateMany({
      where: { serverId: req.params.id },
      data: { lastSeen: new Date() },
    })

    return { raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function getPlayerHistory(req: FastifyRequest<{ Params: { steamId: string } }>) {
  return prisma.playerRecord.findMany({
    where: { steamId: req.params.steamId },
    include: { server: { select: { id: true, name: true } } },
    orderBy: { lastSeen: 'desc' },
  })
}
