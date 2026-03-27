/**
 * player-poller.ts
 *
 * Reconciliation service that polls `getplayers` every 5 minutes for each
 * running server. Diffs the result against open PlayerSessions to catch any
 * joins/leaves that the real-time log monitor (log-monitor.ts) may have missed.
 *
 * Primary player tracking is now event-driven via log-monitor.ts. This service
 * acts as a safety net to prevent state drift.
 */

import prisma from '../db/prisma-client.js'
import { getAdapter } from './rcon-adapter.js'
import type { FastifyBaseLogger } from 'fastify'

const POLL_INTERVAL_MS = 300_000 // 5 minutes — reconciliation safety net

export interface ParsedPlayer {
  displayName: string
  steamId: string
}

/**
 * Parse the raw `getplayers` output.
 *
 * Format:
 *   Current Serverlist:
 *   Nerve : 76561198242849554
 *   SomePlayer : 76561198000000001
 */
export function parseGetPlayers(raw: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.endsWith(':') || trimmed.toLowerCase().startsWith('current')) continue
    // Skip log/error lines that leak into command output (e.g. "[ERROR] ...")
    if (trimmed.startsWith('[')) continue
    // Format: "DisplayName : SteamId64"
    const colonIdx = trimmed.lastIndexOf(' : ')
    if (colonIdx === -1) continue
    const displayName = trimmed.slice(0, colonIdx)
    const steamId = trimmed.slice(colonIdx + 3)
    // Validate steamId looks like a Steam ID64 (17-digit number)
    if (!displayName || !/^\d{10,20}$/.test(steamId)) continue
    players.push({ displayName, steamId })
  }
  return players
}

class PlayerPoller {
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private log: FastifyBaseLogger = console as unknown as FastifyBaseLogger

  setLogger(logger: FastifyBaseLogger): void {
    this.log = logger
  }

  /** Start polling for a specific server. Idempotent — restarts if already running. */
  startPolling(serverId: string): void {
    this.stopPolling(serverId)
    this.log.info({ serverId }, 'player-poller: starting 5min reconciliation')

    // Run immediately, then on interval
    this.poll(serverId).catch((err) =>
      this.log.error({ err, serverId }, 'player-poller: initial poll failed')
    )

    const timer = setInterval(() => {
      this.poll(serverId).catch((err) =>
        this.log.error({ err, serverId }, 'player-poller: poll failed')
      )
    }, POLL_INTERVAL_MS)

    this.timers.set(serverId, timer)
  }

  /** Stop polling for a specific server and close any open sessions. */
  stopPolling(serverId: string): void {
    const timer = this.timers.get(serverId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(serverId)
      this.log.info({ serverId }, 'player-poller: stopped')
    }
  }

  /** Stop polling for a server and close all open sessions (server stopped). */
  async stopAndCloseSessions(serverId: string): Promise<void> {
    this.stopPolling(serverId)
    const now = new Date()
    const openSessions = await prisma.playerSession.findMany({
      where: { serverId, leftAt: null },
    })
    for (const session of openSessions) {
      const duration = Math.floor((now.getTime() - session.joinedAt.getTime()) / 1000)
      await prisma.playerSession.update({
        where: { id: session.id },
        data: { leftAt: now, duration, reason: 'server_stop' },
      })
      // Update total playtime
      await prisma.playerServerStats.updateMany({
        where: { playerId: session.playerId, serverId },
        data: { totalTime: { increment: duration }, lastSeen: now },
      })
    }
    if (openSessions.length > 0) {
      this.log.info({ serverId, count: openSessions.length }, 'player-poller: closed sessions on server stop')
    }
  }

  /** Stop all pollers (shutdown). */
  stopAll(): void {
    for (const [serverId] of this.timers) {
      this.stopPolling(serverId)
    }
  }

  private async poll(serverId: string): Promise<void> {
    const server = await prisma.server.findUnique({ where: { id: serverId } })
    if (!server) {
      this.stopPolling(serverId)
      return
    }

    let adapter
    try {
      adapter = await getAdapter(server)
    } catch {
      return // server not reachable
    }

    let response: string
    try {
      response = await adapter.sendCommand('getplayers')
    } catch {
      return // command failed — skip this cycle
    }

    const onlinePlayers = parseGetPlayers(response)
    const now = new Date()
    const onlineSteamIds = new Set(onlinePlayers.map((p) => p.steamId))

    // Get all currently open sessions for this server
    const openSessions = await prisma.playerSession.findMany({
      where: { serverId, leftAt: null },
      include: { player: true },
    })
    const openBySteamId = new Map(openSessions.map((s) => [s.player.steamId, s]))

    // ── Handle joins (in getplayers but no open session) ─────────────────
    for (const { displayName, steamId } of onlinePlayers) {
      if (openBySteamId.has(steamId)) {
        // Already tracked — update display name if changed
        const session = openBySteamId.get(steamId)!
        if (session.player.displayName !== displayName) {
          await prisma.player.update({
            where: { id: session.player.id },
            data: { displayName },
          })
        }
        continue
      }

      // Upsert Player
      let player = await prisma.player.findUnique({ where: { steamId } })
      if (!player) {
        player = await prisma.player.create({
          data: { steamId, displayName, firstSeen: now, lastSeen: now },
        })
      } else if (player.displayName !== displayName) {
        player = await prisma.player.update({
          where: { id: player.id },
          data: { displayName, lastSeen: now },
        })
      } else {
        await prisma.player.update({
          where: { id: player.id },
          data: { lastSeen: now },
        })
      }

      // Upsert PlayerServerStats
      const existing = await prisma.playerServerStats.findUnique({
        where: { playerId_serverId: { playerId: player.id, serverId } },
      })
      if (!existing) {
        await prisma.playerServerStats.create({
          data: { playerId: player.id, serverId, firstSeen: now, lastSeen: now },
        })
      } else {
        await prisma.playerServerStats.update({
          where: { id: existing.id },
          data: { lastSeen: now },
        })
      }

      // Open session
      await prisma.playerSession.create({
        data: {
          playerId: player.id,
          serverId,
          displayName,
          joinedAt: now,
        },
      })

      this.log.info({ serverId, steamId, displayName }, 'player-poller: player joined')
    }

    // ── Handle leaves (open session but not in getplayers) ───────────────
    for (const [steamId, session] of openBySteamId) {
      if (onlineSteamIds.has(steamId)) continue

      const duration = Math.floor((now.getTime() - session.joinedAt.getTime()) / 1000)
      await prisma.playerSession.update({
        where: { id: session.id },
        data: { leftAt: now, duration, reason: 'disconnect' },
      })

      // Update total playtime
      await prisma.playerServerStats.updateMany({
        where: { playerId: session.playerId, serverId },
        data: { totalTime: { increment: duration }, lastSeen: now },
      })

      this.log.info({ serverId, steamId, duration }, 'player-poller: player left')
    }
  }
}

// Singleton — same pattern as docker-manager
const SINGLETON_KEY = '__ormod_player_poller__'
if (!(globalThis as any)[SINGLETON_KEY]) {
  ;(globalThis as any)[SINGLETON_KEY] = new PlayerPoller()
}
export const playerPoller: PlayerPoller = (globalThis as any)[SINGLETON_KEY]
