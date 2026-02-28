import path from 'node:path'
import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { dockerManager } from '../services/docker-manager.js'

/**
 * Validate that savePath is safe:
 *   - Never allows explicit '..' traversal components.
 *   - When SAVE_BASE_PATH is configured, enforces path confinement.
 */
function validateSavePath(savePath: string, basePath: string): boolean {
  // Reject explicit '..' traversal regardless of base path configuration
  const normalised = savePath.replace(/\\/g, '/')
  if (normalised.split('/').includes('..')) return false
  // If SAVE_BASE_PATH is set, the path must resolve within it
  if (basePath) {
    const resolved = path.resolve(savePath)
    const resolvedBase = path.resolve(basePath)
    return resolved === resolvedBase || resolved.startsWith(resolvedBase + path.sep)
  }
  return true
}

type ServerBody = {
  name: string
  serverName: string
  savePath: string
  containerName?: string | null
  executablePath?: string
  gamePort?: number
  queryPort?: number
  notes?: string
}

export async function listServers() {
  const servers = await prisma.server.findMany({ orderBy: { createdAt: 'asc' } })
  return servers.map((s) => ({ ...s, running: dockerManager.isRunning(s.id) }))
}

export async function createServer(req: FastifyRequest<{ Body: ServerBody }>, reply: FastifyReply) {
  if (!validateSavePath(req.body.savePath, req.server.config.SAVE_BASE_PATH)) {
    return reply.status(400).send({ error: 'Invalid savePath' })
  }
  const server = await prisma.server.create({ data: req.body })
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
  return { ...server, running: dockerManager.isRunning(server.id) }
}

export async function updateServer(
  req: FastifyRequest<{ Params: { id: string }; Body: Partial<ServerBody> }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  if (
    req.body.savePath !== undefined &&
    !validateSavePath(req.body.savePath, req.server.config.SAVE_BASE_PATH)
  ) {
    return reply.status(400).send({ error: 'Invalid savePath' })
  }
  const updated = await prisma.server.update({ where: { id: req.params.id }, data: req.body })
  return { ...updated, running: dockerManager.isRunning(updated.id) }
}

export async function deleteServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
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
