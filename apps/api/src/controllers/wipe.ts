import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'

export async function listWipes(req: FastifyRequest<{ Params: { id: string } }>) {
  return prisma.wipeLog.findMany({
    where: { serverId: req.params.id },
    orderBy: { createdAt: 'desc' },
  })
}

export async function executeWipe(
  req: FastifyRequest<{ Params: { id: string }; Body: { notes?: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const performedBy = req.session!.user.id
  let success = true
  let errorMsg: string | undefined

  try {
    const adapter = await getAdapter(server)
    await adapter.sendCommand('wipe')
  } catch (err) {
    success = false
    errorMsg = err instanceof Error ? err.message : String(err)
  }

  const log = await prisma.wipeLog.create({
    data: {
      serverId: req.params.id,
      triggeredBy: performedBy,
      notes: req.body.notes,
      success,
      errorMsg,
    },
  })

  await prisma.actionLog.create({
    data: {
      serverId: req.params.id,
      performedBy,
      action: 'WIPE',
      details: JSON.stringify({ success, errorMsg }),
    },
  })

  if (!success) {
    return reply.status(500).send({ error: errorMsg })
  }
  return log
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
