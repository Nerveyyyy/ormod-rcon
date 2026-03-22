import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth.js'
import { assertSessionRole } from '../plugins/auth.js'
import type { SessionData } from '../config.js'
import prisma from '../db/prisma-client.js'

// ── Types ───────────────────────────────────────────────────────────────────

type ActivityEvent = {
  id: string
  type: string
  timestamp: string
  displayName: string | null
  steamId: string | null
  detail: string
  source: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchRecentEvents(serverId: string, limit: number, after?: Date): Promise<ActivityEvent[]> {
  const timeFilter = after ? { gte: after } : undefined

  const [actions, sessions] = await Promise.all([
    prisma.actionLog.findMany({
      where: {
        serverId,
        ...(timeFilter ? { createdAt: timeFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true } } },
    }),
    prisma.playerSession.findMany({
      where: {
        serverId,
        ...(timeFilter
          ? {
              OR: [
                { joinedAt: timeFilter },
                { leftAt: timeFilter },
              ],
            }
          : {}),
      },
      orderBy: { joinedAt: 'desc' },
      take: limit,
      include: { player: { select: { displayName: true, steamId: true } } },
    }),
  ])

  const events: ActivityEvent[] = []

  // Action log events
  for (const a of actions) {
    events.push({
      id: `action-${a.id}`,
      type: a.action,
      timestamp: a.createdAt.toISOString(),
      displayName: a.user?.name ?? null,
      steamId: a.targetSteamId,
      detail: formatActionDetail(a),
      source: a.source,
    })
  }

  // Session events — each session can produce a JOIN and optionally a LEAVE
  for (const s of sessions) {
    const joinTime = s.joinedAt
    if (!after || joinTime >= after) {
      events.push({
        id: `join-${s.id}`,
        type: 'JOIN',
        timestamp: joinTime.toISOString(),
        displayName: s.player.displayName,
        steamId: s.player.steamId,
        detail: `${s.player.displayName} joined the server`,
        source: null,
      })
    }

    if (s.leftAt && (!after || s.leftAt >= after)) {
      const reason = s.reason ? ` (${s.reason})` : ''
      events.push({
        id: `leave-${s.id}`,
        type: 'LEAVE',
        timestamp: s.leftAt.toISOString(),
        displayName: s.player.displayName,
        steamId: s.player.steamId,
        detail: `${s.player.displayName} left the server${reason}`,
        source: null,
      })
    }
  }

  // Sort by timestamp descending, take limit
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return events.slice(0, limit)
}

function formatActionDetail(a: {
  action: string
  targetSteamId: string | null
  reason: string | null
  user?: { name: string } | null
  performedBy: string
}): string {
  const actor = a.user?.name ?? a.performedBy
  const target = a.targetSteamId ? ` on ${a.targetSteamId}` : ''
  const reason = a.reason ? ` — ${a.reason}` : ''
  return `${actor}: ${a.action}${target}${reason}`
}

// ── WebSocket route ─────────────────────────────────────────────────────────

export const activityWsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { serverName: string } }>(
    '/ws/activity/:serverName',
    { websocket: true },
    async (socket: WebSocket, req) => {
      // Validate Origin
      const origin = req.headers.origin
      const allowedOrigins = app.config.PUBLIC_URL
        ? [app.config.PUBLIC_URL]
        : [`http://localhost:${app.config.PORT}`]
      if (origin && !allowedOrigins.some((o) => origin.startsWith(o))) {
        socket.close(1008, 'Invalid origin')
        return
      }

      // Validate session
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      })
      if (!session?.user) {
        socket.close(1008, 'Unauthorized')
        return
      }

      const typedSession = session as SessionData
      try {
        assertSessionRole(typedSession)
      } catch {
        socket.close(1008, 'Invalid role')
        return
      }

      const { serverName } = req.params

      const server = await prisma.server.findUnique({ where: { serverName } })
      if (!server) {
        socket.close(1008, 'Server not found')
        return
      }

      const send = (data: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(data))
        }
      }

      // Periodic session re-validation (every 60s)
      const heartbeat = setInterval(async () => {
        try {
          const fresh = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
          })
          if (!fresh?.user?.id) {
            socket.close(1008, 'Session expired')
          }
        } catch {
          socket.close(1008, 'Session validation failed')
        }
      }, 60_000)

      // Send initial batch
      const initialEvents = await fetchRecentEvents(server.id, 50)
      send({ type: 'init', events: initialEvents })

      // Track latest timestamp for polling
      let lastCheck = new Date()

      // Poll for new events every 5 seconds
      const pollInterval = setInterval(async () => {
        try {
          const newEvents = await fetchRecentEvents(server.id, 20, lastCheck)
          if (newEvents.length > 0) {
            lastCheck = new Date()
            send({ type: 'update', events: newEvents })
          }
        } catch {
          // Swallow polling errors — connection will eventually timeout
        }
      }, 5000)

      socket.on('close', () => {
        clearInterval(heartbeat)
        clearInterval(pollInterval)
      })
    }
  )
}
