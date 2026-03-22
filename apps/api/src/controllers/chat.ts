import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { requireServer, paginatedResponse } from '../lib/pagination.js'

type ChatQuery = {
  page?: string
  limit?: string
  channel?: 'global' | 'team' | 'local'
  steamId?: string
}

export async function listByServer(
  req: FastifyRequest<{ Params: { serverName: string }; Querystring: ChatQuery }>,
  reply: FastifyReply
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return

  const { channel, steamId } = req.query
  const where = {
    serverId: server.id,
    ...(channel ? { channel } : {}),
    ...(steamId ? { player: { steamId } } : {}),
  }

  return paginatedResponse(
    { page: req.query.page, limit: req.query.limit ?? '100' },
    (skip, take) =>
      prisma.playerChat.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { player: { select: { steamId: true, displayName: true } } },
      }),
    () => prisma.playerChat.count({ where }),
  )
}
