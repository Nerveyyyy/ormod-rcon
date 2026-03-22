import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { requireServer, paginatedResponse } from '../lib/pagination.js'

export async function listByServer(
  req: FastifyRequest<{ Params: { serverName: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return

  const where = { serverId: server.id }

  return paginatedResponse(
    req.query,
    (skip, take) =>
      prisma.partySnapshot.findMany({
        where,
        orderBy: { capturedAt: 'desc' },
        skip,
        take,
        include: {
          members: {
            include: { player: { select: { steamId: true, displayName: true } } },
          },
        },
      }),
    () => prisma.partySnapshot.count({ where }),
  )
}
