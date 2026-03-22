import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { requireServer, paginatedResponse } from '../lib/pagination.js'

const participantInclude = {
  player: { select: { steamId: true, displayName: true } },
} as const

export async function listMatches(
  req: FastifyRequest<{ Params: { serverName: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return

  const where = { serverId: server.id }

  return paginatedResponse(
    req.query,
    (skip, take) =>
      prisma.arenaMatch.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
        include: { participants: { include: participantInclude } },
      }),
    () => prisma.arenaMatch.count({ where }),
  )
}

export async function getMatch(
  req: FastifyRequest<{ Params: { serverName: string; matchId: string } }>,
  reply: FastifyReply
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return
  const match = await prisma.arenaMatch.findFirst({
    where: { id: req.params.matchId, serverId: server.id },
    include: { participants: { include: participantInclude } },
  })
  if (!match) return reply.status(404).send({ error: 'Match not found' })
  return match
}
