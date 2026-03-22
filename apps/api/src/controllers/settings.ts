import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'

export async function getSettings(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
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

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

export async function updateSettingKey(
  req: FastifyRequest<{ Params: { serverName: string; key: string }; Body: { value: unknown } }>,
  reply: FastifyReply
) {
  if (!KEY_PATTERN.test(req.params.key))
    return reply.badRequest('Invalid setting key')
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand(
      `setserversetting ${req.params.key} ${req.body.value}`
    )
    await prisma.actionLog.create({
      data: {
        serverId: server.id,
        performedBy: req.session!.user.id,
        userId: req.session!.user.id,
        action: 'SETTINGS_SET',
        details: JSON.stringify({ key: req.params.key, value: req.body.value }),
        afterValue: JSON.stringify({ [req.params.key]: req.body.value }),
      },
    })
    return { ok: true, key: req.params.key, value: req.body.value, raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function bulkUpdateSettings(
  req: FastifyRequest<{
    Params: { serverName: string }
    Body: { changes: Record<string, string | number | boolean> }
  }>,
  reply: FastifyReply
) {
  const { changes } = req.body
  const entries = Object.entries(changes)

  if (entries.length === 0) {
    return reply.status(400).send({ error: 'changes must be a non-empty object' })
  }

  const invalidKeys = entries.map(([k]) => k).filter((k) => !KEY_PATTERN.test(k))
  if (invalidKeys.length > 0) {
    return reply.status(400).send({
      error: `Invalid setting keys: ${invalidKeys.join(', ')}. Keys must match ^[a-zA-Z][a-zA-Z0-9_]*$`,
    })
  }

  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  try {
    const adapter = await getAdapter(server)
    const results: { key: string; ok: boolean; raw: string }[] = []

    for (const [key, value] of entries) {
      const command = `setserversetting ${key} ${value}`
      const raw = await adapter.sendCommand(command)
      results.push({ key, ok: true, raw })
    }

    const changedKeys = entries.map(([k]) => k).join(', ')
    await prisma.actionLog.create({
      data: {
        serverId: server.id,
        performedBy: req.session!.user.id,
        userId: req.session!.user.id,
        action: 'SETTINGS_SET',
        details: `Updated settings: ${changedKeys}`,
        beforeValue: null,
        afterValue: JSON.stringify(changes),
      },
    })

    return { results }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}
