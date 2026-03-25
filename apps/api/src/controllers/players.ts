import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'
import { paginationParams } from '../lib/pagination.js'

export async function listPlayers(
  req: FastifyRequest<{
    Params: { serverName: string }
    Querystring: { filter?: string; page?: string; limit?: string; search?: string }
  }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const filter = req.query.filter ?? 'all'
  const search = req.query.search?.trim() ?? ''
  const { skip, take, page, limit } = paginationParams(req.query)

  // Get all online player IDs for status lookup
  const onlineSessions = await prisma.playerSession.findMany({
    where: { serverId: server.id, leftAt: null },
    select: { playerId: true, joinedAt: true },
  })
  const onlineMap = new Map(onlineSessions.map((s) => [s.playerId, s.joinedAt]))

  // Base query: PlayerServerStats for this server
  const where: Record<string, unknown> = { serverId: server.id }

  if (filter === 'online') {
    where.playerId = { in: [...onlineMap.keys()] }
  }

  if (search) {
    where.player = {
      OR: [
        { displayName: { contains: search } },
        { steamId: { contains: search } },
      ],
    }
  }

  const [statsRows, total] = await Promise.all([
    prisma.playerServerStats.findMany({
      where,
      include: { player: true },
      orderBy: { lastSeen: 'desc' },
      skip,
      take,
    }),
    prisma.playerServerStats.count({ where }),
  ])

  // Kill/death counts for this page of players
  const steamIds = statsRows.map((s) => s.player.steamId)
  const playerIds = statsRows.map((s) => s.playerId)

  const [killCounts, deathCounts] = await Promise.all([
    prisma.combatLog.groupBy({
      by: ['killerSteamId'],
      where: { serverId: server.id, killerSteamId: { in: steamIds } },
      _count: true,
    }),
    prisma.combatLog.groupBy({
      by: ['playerId'],
      where: { serverId: server.id, playerId: { in: playerIds } },
      _count: true,
    }),
  ])

  const killMap = new Map(killCounts.map((k) => [k.killerSteamId, k._count]))
  const deathMap = new Map(deathCounts.map((d) => [d.playerId, d._count]))

  const data = statsRows.map((s) => ({
    steamId: s.player.steamId,
    displayName: s.player.displayName,
    online: onlineMap.has(s.playerId),
    joinedAt: onlineMap.get(s.playerId) ?? null,
    totalTime: s.totalTime,
    firstSeen: s.firstSeen,
    lastSeen: s.lastSeen,
    notes: s.notes,
    kills: killMap.get(s.player.steamId) ?? 0,
    deaths: deathMap.get(s.playerId) ?? 0,
  }))

  return { data, page, limit, total }
}

export async function getPlayerHistory(req: FastifyRequest<{ Params: { steamId: string } }>) {
  const player = await prisma.player.findUnique({
    where: { steamId: req.params.steamId },
    include: {
      serverStats: {
        include: { server: { select: { id: true, name: true, serverName: true } } },
        orderBy: { lastSeen: 'desc' },
      },
    },
  })
  if (!player) return null

  // Compute kills/deaths from CombatLog
  const [kills, deaths] = await Promise.all([
    prisma.combatLog.count({ where: { killerSteamId: player.steamId } }),
    prisma.combatLog.count({ where: { playerId: player.id } }),
  ])

  return { ...player, kills, deaths }
}

export async function getPlayerAudit(
  req: FastifyRequest<{ Params: { steamId: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const { skip, take, page, limit } = paginationParams(req.query)

  const where = { targetSteamId: req.params.steamId }
  const [rows, total] = await Promise.all([
    prisma.actionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { name: true } } },
    }),
    prisma.actionLog.count({ where }),
  ])

  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    performedBy: r.user?.name ?? r.performedBy,
    reason: r.reason,
    source: r.source,
    details: r.details,
    createdAt: r.createdAt,
  }))

  return { data, page, limit, total }
}

export async function getPlayerLists(
  req: FastifyRequest<{ Params: { steamId: string } }>
) {
  const entries = await prisma.listEntry.findMany({
    where: { steamId: req.params.steamId },
    include: { list: { select: { id: true, name: true, slug: true, type: true, scope: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return entries.map((e) => ({
    listId: e.list.id,
    listName: e.list.name,
    listSlug: e.list.slug,
    type: e.list.type,
    scope: e.list.scope,
    reason: e.reason,
    addedBy: e.addedBy,
    createdAt: e.createdAt,
  }))
}

// ── Player Action Helpers ─────────────────────────────────────────────────────

type PlayerActionParams = { serverName: string; steamId: string }

async function dispatchPlayerAction(
  req: FastifyRequest<{ Params: PlayerActionParams; Body?: Record<string, unknown> }>,
  reply: FastifyReply,
  command: string,
  action: string,
  targetSteamId: string
): Promise<{ ok: boolean } | FastifyReply> {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  try {
    const adapter = await getAdapter(server)
    await adapter.sendCommand(command)
    await prisma.actionLog.create({
      data: {
        serverId: server.id,
        performedBy: req.session!.user.id,
        userId: req.session!.user.id,
        action,
        targetSteamId,
        details: command,
        reason: (req.body as any)?.reason ?? null,
      },
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return reply.status(503).send({ error: `Server unavailable: ${msg}` })
  }
}

export async function kickPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams; Body?: { reason?: string } }>,
  reply: FastifyReply
) {
  const { steamId } = req.params
  return dispatchPlayerAction(req, reply, `kick ${steamId}`, 'KICK', steamId)
}

export async function banPlayer(
  req: FastifyRequest<{ Params: PlayerActionParams; Body?: { reason?: string } }>,
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

