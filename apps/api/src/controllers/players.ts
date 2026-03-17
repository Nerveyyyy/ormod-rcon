import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'

const VALID_PERMISSION_LEVELS = ['server', 'admin', 'operator', 'client'] as const

export async function listPlayers(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand('getplayers')

    // Update lastSeen for any known DB players when this command is called.
    // Full parsing deferred until the game's response format is confirmed.
    await prisma.playerRecord.updateMany({
      where: { serverId: req.params.id },
      data: { lastSeen: new Date() },
    })

    return { raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function getPlayerHistory(req: FastifyRequest<{ Params: { steamId: string } }>) {
  return prisma.playerRecord.findMany({
    where: { steamId: req.params.steamId },
    include: { server: { select: { id: true, name: true } } },
    orderBy: { lastSeen: 'desc' },
  })
}

// ── Player Action Helpers ─────────────────────────────────────────────────────

type PlayerActionParams = { id: string; steamId: string }

async function dispatchPlayerAction(
  req: FastifyRequest<{ Params: PlayerActionParams }>,
  reply: FastifyReply,
  command: string,
  action: string,
  targetSteamId: string
): Promise<{ ok: boolean; raw: string } | FastifyReply> {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    const adapter = await getAdapter(server)
    const raw = await adapter.sendCommand(command)
    await prisma.actionLog.create({
      data: {
        serverId: server.id,
        performedBy: req.session!.user.id,
        action,
        targetSteamId,
        details: command,
      },
    })
    return { ok: true, raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function kickPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  return dispatchPlayerAction(req, reply, `kick ${steamId}`, 'KICK', steamId)
}

export async function banPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  return dispatchPlayerAction(req, reply, `ban ${steamId}`, 'BAN', steamId)
}

export async function unbanPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  return dispatchPlayerAction(req, reply, `unban ${steamId}`, 'UNBAN', steamId)
}

export async function healPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  return dispatchPlayerAction(req, reply, `heal ${steamId}`, 'HEAL', steamId)
}

export async function whitelistPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  return dispatchPlayerAction(req, reply, `whitelist ${steamId}`, 'WHITELIST', steamId)
}

export async function setPlayerPermissions(
  req: FastifyRequest<{ Params: PlayerActionParams; Body: { level: string } }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  const { level } = req.body
  if (!(VALID_PERMISSION_LEVELS as readonly string[]).includes(level)) {
    return reply.status(400).send({
      error: `Invalid permission level. Must be one of: ${VALID_PERMISSION_LEVELS.join(', ')}`,
    })
  }
  return dispatchPlayerAction(
    req,
    reply,
    `setpermissions ${steamId} ${level}`,
    'SETPERMISSION',
    steamId
  )
}
