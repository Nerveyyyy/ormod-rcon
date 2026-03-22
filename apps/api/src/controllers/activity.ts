import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'

export async function getActivityStats(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const where = { serverId: server.id, createdAt: { gte: todayStart } }

  const [killsToday, deathsToday, messagesToday, playersSeen] = await Promise.all([
    prisma.combatLog.count({ where: { ...where, killerSteamId: { not: null } } }),
    prisma.combatLog.count({ where }),
    prisma.playerChat.count({ where }),
    prisma.playerSession.findMany({
      where: { serverId: server.id, joinedAt: { gte: todayStart } },
      select: { playerId: true },
      distinct: ['playerId'],
    }),
  ])

  return {
    killsToday,
    deathsToday,
    messagesToday,
    playersSeenToday: playersSeen.length,
  }
}
