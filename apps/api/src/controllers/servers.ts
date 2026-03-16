import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { dockerManager } from '../services/docker-manager.js'
import { unregisterCronJob } from './schedule.js'

type ServerBody = {
  name: string
  serverName: string
  containerName?: string | null
  gamePort?: number
  queryPort?: number
  notes?: string
}

const SERVER_SELECT = {
  id: true,
  name: true,
  serverName: true,
  containerName: true,
  mode: true,
  gamePort: true,
  queryPort: true,
  notes: true,
  createdAt: true,
} as const

export async function listServers() {
  const servers = await prisma.server.findMany({
    select: SERVER_SELECT,
    orderBy: { createdAt: 'asc' },
  })
  return servers.map((s) => ({ ...s, running: dockerManager.isRunning(s.id) }))
}

export async function createServer(req: FastifyRequest<{ Body: ServerBody }>, reply: FastifyReply) {
  const { name, serverName, containerName, gamePort, queryPort, notes } = req.body
  const server = await prisma.server.create({
    data: { name, serverName, containerName, gamePort, queryPort, notes },
    select: SERVER_SELECT,
  })
  reply.status(201)
  return { ...server, running: false }
}

export async function getServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({
    where: { id: req.params.id },
    include: { wipeLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const { rconPass: _rconPass, rconPort: _rconPort, ...safeServer } = server
  return { ...safeServer, running: dockerManager.isRunning(server.id) }
}

export async function updateServer(
  req: FastifyRequest<{ Params: { id: string }; Body: Partial<ServerBody> }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const { name, serverName, containerName, gamePort, queryPort, notes } = req.body
  const updated = await prisma.server.update({
    where: { id: req.params.id },
    data: { name, serverName, containerName, gamePort, queryPort, notes },
    select: SERVER_SELECT,
  })
  return { ...updated, running: dockerManager.isRunning(updated.id) }
}

export async function deleteServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const tasks = await prisma.scheduledTask.findMany({ where: { serverId: req.params.id } })
  for (const task of tasks) {
    unregisterCronJob(task.id)
  }

  if (dockerManager.isRunning(req.params.id)) {
    await dockerManager.stop(req.params.id)
  }
  await prisma.server.delete({ where: { id: req.params.id } })
  return { ok: true }
}

export async function startServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    await dockerManager.start(req.params.id)
    return { status: 'started' }
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}

export async function stopServer(req: FastifyRequest<{ Params: { id: string } }>) {
  await dockerManager.stop(req.params.id)
  return { status: 'stopped' }
}

export async function restartServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    await dockerManager.restart(req.params.id)
    return { status: 'restarted' }
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}
