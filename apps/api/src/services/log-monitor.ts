/**
 * log-monitor.ts
 *
 * Subscribes to Docker log emitters and parses game server output for player
 * events (connect, disconnect, death). Replaces the 10-second `getplayers`
 * poll for real-time player tracking. A 5-minute reconciliation poll in
 * player-poller.ts acts as a safety net.
 *
 * Log patterns:
 *   [timestamp] Player With SteamId: 76561198258422208 Connected
 *   [timestamp] Player With SteamId: 76561198260501996 Disconnected
 *   [timestamp] Player Died (ID:76561198260501996)
 */

import prisma from '../db/prisma-client.js'
import { dockerManager } from './docker-manager.js'
import { getAdapter } from './rcon-adapter.js'
import { parseGetPlayers } from './player-poller.js'
import type { FastifyBaseLogger } from 'fastify'

// ── Log line patterns ────────────────────────────────────────────────────────

const CONNECT_RE = /Player With SteamId: (\d{10,20}) Connected/
const DISCONNECT_RE = /Player With SteamId: (\d{10,20}) Disconnected/
const DEATH_RE = /Player Died \(ID:(\d{10,20})\)/

// Debounce window for fetching display names after connect events
const NAME_REFRESH_DELAY_MS = 3_000

interface Listener {
  lineHandler: (line: string) => void
  exitHandler: () => void
}

class LogMonitor {
  private listeners = new Map<string, Listener>()
  private nameRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private log: FastifyBaseLogger = console as unknown as FastifyBaseLogger

  setLogger(logger: FastifyBaseLogger): void {
    this.log = logger
  }

  /** Start monitoring a server's log output for player events. */
  startMonitoring(serverId: string): void {
    this.stopMonitoring(serverId)

    const emitter = dockerManager.getOutputEmitter(serverId)
    if (!emitter) {
      this.log.warn({ serverId }, 'log-monitor: no output emitter, skipping')
      return
    }

    const lineHandler = (line: string) => this.onLine(serverId, line)
    const exitHandler = () => {
      this.log.info({ serverId }, 'log-monitor: container exited, stopping monitor')
      this.stopMonitoring(serverId)
    }

    emitter.on('line', lineHandler)
    emitter.on('exit', exitHandler)
    this.listeners.set(serverId, { lineHandler, exitHandler })
    this.log.info({ serverId }, 'log-monitor: started')
  }

  /** Stop monitoring a server. */
  stopMonitoring(serverId: string): void {
    const listener = this.listeners.get(serverId)
    if (listener) {
      const emitter = dockerManager.getOutputEmitter(serverId)
      if (emitter) {
        emitter.off('line', listener.lineHandler)
        emitter.off('exit', listener.exitHandler)
      }
      this.listeners.delete(serverId)
    }
    const timer = this.nameRefreshTimers.get(serverId)
    if (timer) {
      clearTimeout(timer)
      this.nameRefreshTimers.delete(serverId)
    }
  }

  /** Stop all monitors (shutdown). */
  stopAll(): void {
    for (const [serverId] of this.listeners) {
      this.stopMonitoring(serverId)
    }
  }

  // ── Line parsing ─────────────────────────────────────────────────────────

  private onLine(serverId: string, line: string): void {
    let match: RegExpMatchArray | null

    match = line.match(CONNECT_RE)
    if (match?.[1]) {
      this.handleConnect(serverId, match[1]).catch((err) =>
        this.log.error({ err, serverId }, 'log-monitor: connect handler failed')
      )
      return
    }

    match = line.match(DISCONNECT_RE)
    if (match?.[1]) {
      this.handleDisconnect(serverId, match[1]).catch((err) =>
        this.log.error({ err, serverId }, 'log-monitor: disconnect handler failed')
      )
      return
    }

    match = line.match(DEATH_RE)
    if (match?.[1]) {
      this.log.info({ serverId, steamId: match[1] }, 'log-monitor: player died')
      return
    }
  }

  // ── Event handlers ───────────────────────────────────────────────────────

  private async handleConnect(serverId: string, steamId: string): Promise<void> {
    const now = new Date()

    // Check for existing open session (avoid duplicates if reconciliation ran first)
    const existing = await prisma.playerSession.findFirst({
      where: {
        serverId,
        leftAt: null,
        player: { steamId },
      },
    })
    if (existing) {
      this.log.debug({ serverId, steamId }, 'log-monitor: session already open, skipping connect')
      return
    }

    // Upsert Player (display name will be steamId temporarily until getplayers runs)
    let player = await prisma.player.findUnique({ where: { steamId } })
    if (!player) {
      player = await prisma.player.create({
        data: { steamId, displayName: steamId, firstSeen: now, lastSeen: now },
      })
    } else {
      await prisma.player.update({
        where: { id: player.id },
        data: { lastSeen: now },
      })
    }

    // Upsert PlayerServerStats
    const stats = await prisma.playerServerStats.findUnique({
      where: { playerId_serverId: { playerId: player.id, serverId } },
    })
    if (!stats) {
      await prisma.playerServerStats.create({
        data: { playerId: player.id, serverId, firstSeen: now, lastSeen: now },
      })
    } else {
      await prisma.playerServerStats.update({
        where: { id: stats.id },
        data: { lastSeen: now },
      })
    }

    // Create session with steamId as placeholder display name
    await prisma.playerSession.create({
      data: {
        playerId: player.id,
        serverId,
        displayName: player.displayName,
        joinedAt: now,
      },
    })

    this.log.info({ serverId, steamId }, 'log-monitor: player connected')

    // Schedule debounced getplayers to fetch real display names
    this.scheduleNameRefresh(serverId)
  }

  private async handleDisconnect(serverId: string, steamId: string): Promise<void> {
    const now = new Date()

    // Find the open session for this player
    const session = await prisma.playerSession.findFirst({
      where: {
        serverId,
        leftAt: null,
        player: { steamId },
      },
    })
    if (!session) {
      this.log.warn({ serverId, steamId }, 'log-monitor: no open session for disconnect (reconciliation will handle)')
      return
    }

    const duration = Math.floor((now.getTime() - session.joinedAt.getTime()) / 1000)
    await prisma.playerSession.update({
      where: { id: session.id },
      data: { leftAt: now, duration, reason: 'disconnect' },
    })

    await prisma.playerServerStats.updateMany({
      where: { playerId: session.playerId, serverId },
      data: { totalTime: { increment: duration }, lastSeen: now },
    })

    this.log.info({ serverId, steamId, duration }, 'log-monitor: player disconnected')
  }

  // ── Display name refresh ─────────────────────────────────────────────────

  /**
   * Debounced `getplayers` to fetch real display names after connect events.
   * Multiple connects within 3s trigger only one command.
   */
  private scheduleNameRefresh(serverId: string): void {
    const existing = this.nameRefreshTimers.get(serverId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.nameRefreshTimers.delete(serverId)
      this.refreshDisplayNames(serverId).catch((err) =>
        this.log.error({ err, serverId }, 'log-monitor: name refresh failed')
      )
    }, NAME_REFRESH_DELAY_MS)

    this.nameRefreshTimers.set(serverId, timer)
  }

  private async refreshDisplayNames(serverId: string): Promise<void> {
    const server = await prisma.server.findUnique({ where: { id: serverId } })
    if (!server) return

    let adapter
    try {
      adapter = await getAdapter(server)
    } catch {
      return
    }

    let response: string
    try {
      response = await adapter.sendCommand('getplayers')
    } catch {
      return
    }

    const players = parseGetPlayers(response)
    if (players.length === 0) return

    for (const { steamId, displayName } of players) {
      // Update Player display name if it's different (especially if it was set to steamId as placeholder)
      const player = await prisma.player.findUnique({ where: { steamId } })
      if (player && player.displayName !== displayName) {
        await prisma.player.update({
          where: { id: player.id },
          data: { displayName },
        })
      }

      // Update open session display name
      if (player) {
        await prisma.playerSession.updateMany({
          where: { playerId: player.id, serverId, leftAt: null },
          data: { displayName },
        })
      }
    }

    this.log.info({ serverId, count: players.length }, 'log-monitor: refreshed display names')
  }
}

// Singleton — same pattern as docker-manager and player-poller
const SINGLETON_KEY = '__ormod_log_monitor__'
if (!(globalThis as any)[SINGLETON_KEY]) {
  ;(globalThis as any)[SINGLETON_KEY] = new LogMonitor()
}
export const logMonitor: LogMonitor = (globalThis as any)[SINGLETON_KEY]
