import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { dockerManager } from '../services/docker-manager.js'
import { getAdapter } from '../services/rcon-adapter.js'
import { unregisterCronJob } from './schedule.js'

const VALID_WEATHER_TYPES = [
  'cloudy',
  'stormy',
  'overcast',
  'sparse',
  'clear',
  'lightningstorm',
  'lightrain',
] as const

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
  if (containerName) {
    const existing = await prisma.server.findFirst({ where: { containerName } })
    if (existing) {
      return reply.status(409).send({ error: `Container name "${containerName}" is already used by server "${existing.name}"` })
    }
  }
  const server = await prisma.server.create({
    data: { name, serverName, containerName, gamePort, queryPort, notes },
    select: SERVER_SELECT,
  })

  // Check if the container is already running and reconnect log stream if so
  let running = false
  try {
    const cName = containerName?.trim() || process.env.GAME_CONTAINER_NAME || 'ormod-server'
    const info = await dockerManager.inspect(cName)
    running = info?.running === true
    if (running) {
      await dockerManager.reconnectServer(server.id)
    }
  } catch {
    // Docker unavailable — server created but status unknown
  }

  reply.status(201)
  return { ...server, running }
}

export async function getServer(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({
    where: { serverName: req.params.serverName },
    include: { wipeLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const { rconPass: _rconPass, rconPort: _rconPort, ...safeServer } = server
  return { ...safeServer, running: dockerManager.isRunning(server.id) }
}

export async function updateServer(
  req: FastifyRequest<{ Params: { serverName: string }; Body: Partial<ServerBody> }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const { name, serverName, containerName, gamePort, queryPort, notes } = req.body
  if (containerName) {
    const existing = await prisma.server.findFirst({
      where: { containerName, id: { not: server.id } },
    })
    if (existing) {
      return reply.status(409).send({ error: `Container name "${containerName}" is already used by server "${existing.name}"` })
    }
  }
  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { name, serverName, containerName, gamePort, queryPort, notes },
    select: SERVER_SELECT,
  })
  return { ...updated, running: dockerManager.isRunning(updated.id) }
}

export async function deleteServer(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const tasks = await prisma.scheduledTask.findMany({ where: { serverId: server.id } })
  for (const task of tasks) {
    unregisterCronJob(task.id)
  }

  if (dockerManager.isRunning(server.id)) {
    await dockerManager.stop(server.id)
  }
  await prisma.server.delete({ where: { id: server.id } })
  return { ok: true }
}

export async function startServer(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  if (process.env.DEMO_MODE === 'true') return { status: 'started' }
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    await dockerManager.start(server.id)
    return { status: 'started' }
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}

export async function stopServer(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  if (process.env.DEMO_MODE === 'true') return { status: 'stopped' }
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  await dockerManager.stop(server.id)
  return { status: 'stopped' }
}

export async function restartServer(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  if (process.env.DEMO_MODE === 'true') return { status: 'restarted' }
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    await dockerManager.restart(server.id)
    return { status: 'restarted' }
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}

// ── Dashboard Quick Actions ───────────────────────────────────────────────────

type ActionParams = { serverName: string }

async function dispatchServerAction(
  req: FastifyRequest<{ Params: ActionParams }>,
  reply: FastifyReply,
  command: string,
  action: string
): Promise<{ ok: boolean; raw: string } | FastifyReply> {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand(command)
    await prisma.actionLog.create({
      data: {
        serverId: server.id,
        performedBy: req.session!.user.id,
        userId: req.session!.user.id,
        action,
        details: command,
      },
    })
    return { ok: true, raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function forceSave(
  req: FastifyRequest<{ Params: ActionParams }>,
  reply: FastifyReply
) {
  return dispatchServerAction(req, reply, 'forcesave', 'COMMAND')
}

export async function sendAnnouncement(
  req: FastifyRequest<{ Params: ActionParams; Body: { message: string } }>,
  reply: FastifyReply
) {
  const { message } = req.body
  if (!message || !message.trim()) {
    return reply.status(400).send({ error: 'message must be a non-empty string' })
  }
  return dispatchServerAction(req, reply, `announcement ${message}`, 'COMMAND')
}

export async function setWeather(
  req: FastifyRequest<{ Params: ActionParams; Body: { type: string } }>,
  reply: FastifyReply
) {
  const { type } = req.body
  if (!(VALID_WEATHER_TYPES as readonly string[]).includes(type)) {
    return reply.status(400).send({
      error: `Invalid weather type. Must be one of: ${VALID_WEATHER_TYPES.join(', ')}`,
    })
  }
  return dispatchServerAction(req, reply, `setweather ${type}`, 'COMMAND')
}

export async function killAll(
  req: FastifyRequest<{ Params: ActionParams }>,
  reply: FastifyReply
) {
  return dispatchServerAction(req, reply, 'killall', 'COMMAND')
}

export async function broadcastMessage(
  req: FastifyRequest<{ Params: ActionParams; Body: { message: string } }>,
  reply: FastifyReply
) {
  const { message } = req.body
  if (!message || !message.trim()) {
    return reply.status(400).send({ error: 'message must be a non-empty string' })
  }
  return dispatchServerAction(req, reply, `say ${message}`, 'COMMAND')
}
