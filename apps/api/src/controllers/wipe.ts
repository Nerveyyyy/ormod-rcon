import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'

export async function listWipes(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const logs = await prisma.wipeLog.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: 'desc' },
  })

  // Resolve user IDs to names
  const userIds = [...new Set(logs.map((l) => l.triggeredBy))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  return logs.map((l) => ({
    ...l,
    triggeredByName: userMap.get(l.triggeredBy) ?? null,
  }))
}

export async function executeWipe(
  req: FastifyRequest<{ Params: { serverName: string }; Body: { notes?: string; type?: string; targetSteamId?: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const wipeType = req.body.type ?? 'full'
  const targetSteamId = req.body.targetSteamId

  if (targetSteamId && wipeType !== 'playerdata') {
    return reply.status(400).send({ error: 'targetSteamId is only valid for type "playerdata"' })
  }

  let command: string
  if (wipeType === 'map') {
    command = 'wipemap'
  } else if (wipeType === 'playerdata') {
    command = targetSteamId ? `wipeplayerdata ${targetSteamId}` : 'wipeplayerdata'
  } else {
    command = 'wipe'
  }

  const performedBy = req.session!.user.id
  let success = true
  let errorMsg: string | undefined

  try {
    const adapter = await getAdapter(server)
    await adapter.sendCommand(command)
  } catch (err) {
    success = false
    errorMsg = err instanceof Error ? err.message : String(err)
  }

  const log = await prisma.wipeLog.create({
    data: {
      serverId: server.id,
      triggeredBy: performedBy,
      notes: req.body.notes,
      type: wipeType,
      targetSteamId: targetSteamId ?? null,
      success,
      errorMsg,
    },
  })

  await prisma.actionLog.create({
    data: {
      serverId: server.id,
      performedBy,
      userId: performedBy,
      action: 'WIPE',
      targetSteamId: targetSteamId ?? null,
      beforeValue: JSON.stringify({ type: wipeType }),
      details: JSON.stringify({ success, errorMsg }),
    },
  })

  if (!success) {
    return reply.status(500).send({ error: errorMsg })
  }
  return log
}

export async function getWipeLog(
  req: FastifyRequest<{ Params: { serverName: string; wipeId: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const log = await prisma.wipeLog.findFirst({
    where: { id: req.params.wipeId, serverId: server.id },
  })
  if (!log) return reply.status(404).send({ error: 'Wipe log not found' })
  return log
}
