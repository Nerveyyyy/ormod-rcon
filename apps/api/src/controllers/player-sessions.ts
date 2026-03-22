import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { requireServer, paginatedResponse } from '../lib/pagination.js'

type ListByServerQuery = {
  page?:    string
  limit?:   string
  steamId?: string
  active?:  'true' | 'false'
}

export async function listByServer(
  req: FastifyRequest<{ Params: { serverName: string }; Querystring: ListByServerQuery }>,
  reply: FastifyReply
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return

  const where: Record<string, unknown> = { serverId: server.id }

  if (req.query.steamId) where.player = { steamId: req.query.steamId }
  if (req.query.active === 'true') where.leftAt = null
  else if (req.query.active === 'false') where.leftAt = { not: null }

  return paginatedResponse(
    req.query,
    (skip, take) =>
      prisma.playerSession.findMany({
        where,
        skip,
        take,
        orderBy: { joinedAt: 'desc' },
        include: { player: { select: { steamId: true, displayName: true } } },
      }),
    () => prisma.playerSession.count({ where }),
  )
}
