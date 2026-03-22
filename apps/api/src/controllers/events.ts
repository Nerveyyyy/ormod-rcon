import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { requireServer, paginatedResponse } from '../lib/pagination.js'

type ListByServerQuery = { page?: string; limit?: string; name?: string }

export async function listByServer(
  req: FastifyRequest<{ Params: { serverName: string }; Querystring: ListByServerQuery }>,
  reply: FastifyReply
) {
  const server = await requireServer(req.params.serverName, reply)
  if (!server) return

  const { name } = req.query

  // Wildcard suffix (e.g. "server.*") → startsWith, otherwise exact match
  let nameFilter: { startsWith: string } | { equals: string } | undefined
  if (name !== undefined && name !== '') {
    if (name.endsWith('.*')) {
      nameFilter = { startsWith: name.slice(0, -2) + '.' }
    } else {
      nameFilter = { equals: name }
    }
  }

  const where = {
    serverId: server.id,
    ...(nameFilter !== undefined ? { name: nameFilter } : {}),
  }

  return paginatedResponse(
    req.query,
    (skip, take) =>
      prisma.gameEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    () => prisma.gameEvent.count({ where }),
  )
}
