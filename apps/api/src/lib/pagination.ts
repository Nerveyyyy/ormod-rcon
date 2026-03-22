import type { FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'

export function paginationParams(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10) || 50))
  return { skip: (page - 1) * limit, take: limit, page, limit }
}

/**
 * Look up a server by serverName. Returns the server or sends a 404 and returns null.
 * Callers should `return` early when the result is null.
 */
export async function requireServer(serverName: string, reply: FastifyReply) {
  const server = await prisma.server.findUnique({ where: { serverName } })
  if (!server) {
    reply.status(404).send({ error: 'Server not found' })
    return null
  }
  return server
}

/**
 * Run a paginated findMany + count in parallel and return the standard response shape.
 * Each caller provides its own query callbacks so Prisma types stay fully inferred.
 */
export async function paginatedResponse<T>(
  query: { page?: string; limit?: string },
  findMany: (skip: number, take: number) => Promise<T[]>,
  count: () => Promise<number>,
) {
  const { skip, take, page, limit } = paginationParams(query)
  const [data, total] = await Promise.all([findMany(skip, take), count()])
  return { data, page, limit, total }
}
