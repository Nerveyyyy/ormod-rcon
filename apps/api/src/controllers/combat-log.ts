import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { requireServer, paginatedResponse } from '../lib/pagination.js'

type CombatLogQuery = {
  page?: string
  limit?: string
  steamId?: string
  type?: 'pvp' | 'pve' | 'all'
}

export async function listByServer(
  req: FastifyRequest<{ Params: { serverName: string }; Querystring: CombatLogQuery }>,
  reply: FastifyReply,
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return

  const { steamId, type = 'all' } = req.query
  const where: Record<string, unknown> = { serverId: server.id }

  if (steamId) where['player'] = { steamId }
  if (type === 'pvp') where['killerSteamId'] = { not: null }
  else if (type === 'pve') where['killerSteamId'] = null

  return paginatedResponse(
    req.query,
    (skip, take) =>
      prisma.combatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { player: { select: { steamId: true, displayName: true } } },
      }),
    () => prisma.combatLog.count({ where }),
  )
}
