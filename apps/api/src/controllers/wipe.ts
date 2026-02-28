import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { WipeService } from '../services/wipe-service.js'
import type { WipeConfig } from '../services/wipe-service.js'

const wipeService = new WipeService()

export async function listWipes(req: FastifyRequest<{ Params: { id: string } }>) {
  return prisma.wipeLog.findMany({
    where: { serverId: req.params.id },
    orderBy: { createdAt: 'desc' },
  })
}

export async function executeWipe(
  req: FastifyRequest<{ Params: { id: string }; Body: WipeConfig }>,
  reply: FastifyReply
) {
  reply.raw.setTimeout(300_000, () => {}) // 5 min timeout for long wipes
  try {
    const log = await wipeService.executeWipe(req.params.id, req.body, 'dashboard')
    return log
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}

export async function getWipeLog(
  req: FastifyRequest<{ Params: { id: string; wipeId: string } }>,
  reply: FastifyReply
) {
  const log = await prisma.wipeLog.findFirst({
    where: { id: req.params.wipeId, serverId: req.params.id },
  })
  if (!log) return reply.status(404).send({ error: 'Wipe log not found' })
  return log
}
