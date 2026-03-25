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
      select: {
        id: true,
        action: true,
        details: true,
        beforeValue: true,
        afterValue: true,
        targetSteamId: true,
        reason: true,
        source: true,
        performedBy: true,
        createdAt: true,
        user: { select: { name: true } },
      },
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

  // Batch-resolve player display names for targetSteamIds
  const targetSteamIds = [...new Set(actions.map((a) => a.targetSteamId).filter(Boolean))] as string[]
  const playerNameMap = new Map<string, string>()
  if (targetSteamIds.length > 0) {
    const players = await prisma.player.findMany({
      where: { steamId: { in: targetSteamIds } },
      select: { steamId: true, displayName: true },
    })
    for (const p of players) playerNameMap.set(p.steamId, p.displayName)
  }

  // Action log events
  for (const a of actions) {
    events.push({
      id: `action-${a.id}`,
      type: a.action,
      timestamp: a.createdAt.toISOString(),
      displayName: a.user?.name ?? null,
      steamId: a.targetSteamId,
      detail: formatActionDetail(a, playerNameMap),
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
  details: string | null
  beforeValue: string | null
  afterValue: string | null
  targetSteamId: string | null
  reason: string | null
  source: string
  user?: { name: string } | null
  performedBy: string
}, playerNameMap?: Map<string, string>): string {
  const actor = a.user?.name ?? a.performedBy

  // Settings changes: show which keys were changed and their values
  if (a.action === 'SETTINGS_SET' && a.details) {
    try {
      const parsed = JSON.parse(a.details)
      if (parsed.key) {
        return `${actor} changed ${parsed.key} to ${parsed.value}`
      }
    } catch {
      // Bulk update: "Updated settings: key1, key2" — enrich with values from afterValue
      if (a.details.startsWith('Updated settings:') && a.afterValue) {
        try {
          const values = JSON.parse(a.afterValue) as Record<string, unknown>
          const pairs = Object.entries(values).map(([k, v]) => `${k}=${v}`).join(', ')
          return `${actor} updated settings: ${pairs}`
        } catch {
          return `${actor} ${a.details.toLowerCase()}`
        }
      }
    }
  }

  // Wipe actions: show wipe type and target
  if (a.action === 'WIPE' && a.beforeValue) {
    try {
      const parsed = JSON.parse(a.beforeValue) as { type?: string }
      const wipeType = parsed.type ?? 'full'
      const typeLabel = wipeType === 'map' ? 'Map Wipe' : wipeType === 'playerdata' ? 'Player Data Wipe' : 'Full Wipe'
      const target = a.targetSteamId ? ` (${a.targetSteamId})` : ''
      return `${actor} executed ${typeLabel}${target}`
    } catch { /* fall through */ }
  }

  // Schedule run actions
  if (a.action === 'SCHEDULE_RUN' && a.details) {
    try {
      const parsed = JSON.parse(a.details) as { schedule?: string; type?: string; payload?: string; manual?: boolean }
      if (parsed.schedule) {
        const taskType = parsed.type === 'RESTART' ? 'restart' : `command: ${parsed.payload ?? ''}`
        if (parsed.manual) {
          return `${actor} manually ran "${parsed.schedule}" (${taskType})`
        }
        return `Scheduled "${parsed.schedule}" ran (${taskType})`
      }
    } catch { /* fall through */ }
  }

  // Schedule CRUD actions
  if (a.action === 'SCHEDULE_CREATE' || a.action === 'SCHEDULE_DELETE' || a.action === 'SCHEDULE_UPDATE') {
    if (a.details) {
      try {
        const parsed = JSON.parse(a.details) as { label?: string; change?: string }
        const verb = a.action === 'SCHEDULE_CREATE' ? 'created' : a.action === 'SCHEDULE_DELETE' ? 'deleted' : parsed.change ?? 'updated'
        return `${actor} ${verb} schedule "${parsed.label ?? 'unknown'}"`
      } catch { /* fall through */ }
    }
  }

  // Access list CRUD actions
  if (a.action === 'LIST_CREATE' || a.action === 'LIST_DELETE') {
    if (a.details) {
      try {
        const parsed = JSON.parse(a.details) as { name?: string; type?: string }
        const verb = a.action === 'LIST_CREATE' ? 'created' : 'deleted'
        const listType = parsed.type ? ` (${parsed.type.toLowerCase()})` : ''
        return `${actor} ${verb} list "${parsed.name ?? 'unknown'}"${listType}`
      } catch { /* fall through */ }
    }
  }

  // Access list entry actions with list name
  if (['BAN', 'UNBAN', 'WHITELIST', 'REMOVEWHITELIST', 'SETPERMISSION', 'REMOVEPERMISSION'].includes(a.action) && a.details) {
    try {
      const parsed = JSON.parse(a.details) as { list?: string; permission?: string }
      const steamId = a.targetSteamId ?? 'unknown'
      const name = a.targetSteamId && playerNameMap?.get(a.targetSteamId)
      const target = name ? `${name} (${steamId})` : steamId
      if (parsed.list) {
        const actionLabel: Record<string, string> = {
          BAN: 'banned', UNBAN: 'unbanned',
          WHITELIST: 'whitelisted', REMOVEWHITELIST: 'removed from whitelist',
          SETPERMISSION: 'set permissions for', REMOVEPERMISSION: 'removed permissions for',
        }
        const verb = actionLabel[a.action] ?? a.action.toLowerCase()
        const extra = a.action === 'SETPERMISSION' && parsed.permission ? ` (${parsed.permission})` : ''
        return `${actor} ${verb} ${target} in "${parsed.list}"${extra}`
      }
    } catch { /* fall through */ }
  }

  // Player actions (kick, ban, unban, setpermission) — resolve player name for readability
  const targetName = a.targetSteamId && playerNameMap?.get(a.targetSteamId)
  const targetLabel = targetName
    ? `${targetName} (${a.targetSteamId})`
    : a.targetSteamId ?? 'unknown'

  if (a.action === 'KICK') {
    const reason = a.reason ? ` — ${a.reason}` : ''
    return `${actor} kicked ${targetLabel}${reason}`
  }

  if (a.action === 'BAN') {
    const reason = a.reason ? ` — ${a.reason}` : ''
    return `${actor} banned ${targetLabel}${reason}`
  }

  if (a.action === 'UNBAN') {
    return `${actor} unbanned ${targetLabel}`
  }

  if (a.action === 'SETPERMISSION') {
    // Permission level may be in afterValue (from RCON events) or parsed from command in details
    let level: string | null = null
    if (a.afterValue) {
      try { level = JSON.parse(a.afterValue) } catch { level = a.afterValue }
    } else if (a.details) {
      // details = "setpermissions <steamId> <level>"
      const parts = a.details.split(/\s+/)
      if (parts.length >= 3) level = parts[parts.length - 1] ?? null
    }
    const levelSuffix = level ? ` to ${level}` : ''
    return `${actor} set permissions for ${targetLabel}${levelSuffix}`
  }

  if (a.action === 'REMOVEPERMISSION') {
    return `${actor} removed permissions for ${targetLabel}`
  }

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
