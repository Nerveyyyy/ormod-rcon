import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'

export async function getSettings(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand('getserversettings')
    return { raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function updateSettingKey(
  req: FastifyRequest<{ Params: { id: string; key: string }; Body: { value: unknown } }>,
  reply: FastifyReply
) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(req.params.key))
    return reply.badRequest('Invalid setting key')
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand(
      `setserversetting ${req.params.key} ${req.body.value}`
    )
    return { ok: true, key: req.params.key, value: req.body.value, raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}
