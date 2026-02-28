import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { FileIOService } from '../services/file-io.js'

export async function getSettings(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const io = new FileIOService(server.savePath)
  return await io.readSettings()
}

export async function replaceSettings(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const io = new FileIOService(server.savePath)
  await io.writeSettings(req.body)
  return { ok: true }
}

export async function updateSettingKey(
  req: FastifyRequest<{ Params: { id: string; key: string }; Body: { value: unknown } }>,
  reply: FastifyReply
) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(req.params.key))
    return reply.badRequest('Invalid setting key')
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const io = new FileIOService(server.savePath)
  const current = await io.readSettings()
  current[req.params.key] = req.body.value
  await io.writeSettings(current)
  return { ok: true, key: req.params.key, value: req.body.value }
}
