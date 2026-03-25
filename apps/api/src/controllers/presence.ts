import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'

export async function getPresence(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  // 1. Dashboard users from in-memory presence tracker
  const cutoff = new Date(Date.now() - 5 * 60 * 1000)
  const dashboardUsers: { name: string; role: string }[] = []
  for (const [, entry] of req.server.presenceTracker) {
    if (entry.lastSeen >= cutoff) {
      dashboardUsers.push({ name: entry.name, role: entry.role })
    }
  }

  // 2. Online admins: cross-reference PlayerSession (online) with ADMIN AccessList entries
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const onlineSessions = await prisma.playerSession.findMany({
    where: { serverId: server.id, leftAt: null },
    include: { player: { select: { steamId: true, displayName: true } } },
  })

  const adminEntries = await prisma.listEntry.findMany({
    where: {
      list: { type: 'ADMIN' },
      permission: { in: ['server', 'admin', 'operator'] },
    },
    select: { steamId: true, permission: true },
  })
  const adminMap = new Map(adminEntries.map((e) => [e.steamId, e.permission!]))

  const onlineAdmins = onlineSessions
    .filter((s) => adminMap.has(s.player.steamId))
    .map((s) => ({
      displayName: s.player.displayName ?? s.displayName,
      steamId: s.player.steamId,
      permission: adminMap.get(s.player.steamId)!,
    }))

  return { dashboardUsers, onlineAdmins }
}
