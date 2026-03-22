/**
 * rcon-event-persister.ts
 *
 * Stateless service that receives parsed RCON events and persists them to the
 * database. One instance per server, constructed with the server's DB id.
 *
 * Event shape mirrors the server-push events defined in rcon/schema.ts.
 * Each handler method extracts strongly-typed fields from the generic `data`
 * payload and writes the appropriate DB records.
 */

import prisma from '../db/prisma-client.js'

// ─────────────────────────────────────────────────────────────────────────────
// Public event envelope
// Shape is generic here; each handler casts data to its known structure.
// Ground-truth type definitions live in rcon/schema.ts (ServerEvent union).
// ─────────────────────────────────────────────────────────────────────────────

export interface RconEvent {
  name: string
  timestamp?: string
  data: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal data shapes — mirror the fields defined in rcon/schema.ts
// ─────────────────────────────────────────────────────────────────────────────

interface Vec3 {
  x: number
  y: number
  z: number
}

interface PlayerJoinData {
  steamId: string
  displayName: string
}

interface PlayerLeaveData {
  steamId: string
  displayName: string
  reason: 'disconnect' | 'kick' | 'ban' | 'timeout' | 'error'
}

interface PlayerDeathData {
  steamId: string
  displayName: string
  cause: string
  location?: Vec3
  killerSteamId?: string
  killerDisplayName?: string
  weapon?: string
}

interface PlayerChatData {
  steamId: string
  displayName: string
  message: string
  channel: 'global' | 'team' | 'local'
}

interface PlayerBanData {
  steamId: string
  displayName: string
  bannedBy: string
}

interface PlayerKickData {
  steamId: string
  displayName: string
  kickedBy: string
}

interface PlayerPermissionChangeData {
  steamId: string
  displayName: string
  previous: string | null
  current: string | null
  changedBy: string
}

interface WipeCompleteData {
  type: string
  durationMs: number
  targetSteamId?: string
}

interface ArenaMatchStartData {
  matchId: string
  kit: string
  participants: Array<{ steamId: string; teamNumber: number }>
}

interface ArenaMatchEndData {
  matchId: string
  winnerTeam: number | null
  durationSeconds: number
  scores: Record<string, number>
}

interface ArenaPlayerRespawnData {
  matchId: string
  steamId: string
  displayName: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class RconEventPersister {
  constructor(private serverId: string) {}

  /**
   * Route an incoming RCON event to the appropriate handler.
   * Unknown event names are warned and skipped — never throw.
   */
  async handleEvent(event: RconEvent): Promise<void> {
    try {
      switch (event.name) {
        case 'player.join':
          await this.handlePlayerJoin(event)
          break
        case 'player.leave':
          await this.handlePlayerLeave(event)
          break
        case 'player.death':
          await this.handlePlayerDeath(event)
          break
        case 'player.chat':
          await this.handlePlayerChat(event)
          break
        case 'player.ban':
          await this.handlePlayerBan(event)
          break
        case 'player.kick':
          await this.handlePlayerKick(event)
          break
        case 'player.permission.change':
          await this.handlePlayerPermissionChange(event)
          break
        case 'wipe.start':
          await this.handleWipeStart(event)
          break
        case 'wipe.complete':
          await this.handleWipeComplete(event)
          break
        case 'arena.match.start':
          await this.handleArenaMatchStart(event)
          break
        case 'arena.match.end':
          await this.handleArenaMatchEnd(event)
          break
        case 'arena.player.respawn':
          await this.handleArenaPlayerRespawn(event)
          break
        default:
          // Covers: server.*, world.*  — persist as GameEvent
          if (
            event.name.startsWith('server.') ||
            event.name.startsWith('world.')
          ) {
            await this.handleGameEvent(event)
          } else {
            console.warn(
              `[rcon-event-persister] Unknown event "${event.name}" for server ${this.serverId} — skipped`,
            )
          }
      }
    } catch (err) {
      console.error(
        `[rcon-event-persister] Failed to persist event "${event.name}" for server ${this.serverId}:`,
        err,
      )
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private eventTime(event: RconEvent): Date {
    return this.eventTime(event)
  }

  /**
   * Upsert a Player record by steamId and return the internal Player.id.
   * Updates displayName and lastSeen on every call.
   */
  private async resolvePlayer(
    steamId: string,
    displayName?: string,
  ): Promise<string> {
    const player = await prisma.player.upsert({
      where: { steamId },
      create: {
        steamId,
        displayName: displayName ?? steamId,
      },
      update: {
        displayName: displayName ?? undefined,
        lastSeen: new Date(),
      },
      select: { id: true },
    })
    return player.id
  }

  /**
   * Find the most-recent open PlayerSession for a player on this server.
   * Returns null if none exists.
   */
  private async findOpenSession(
    playerId: string,
  ): Promise<{ id: string; joinedAt: Date } | null> {
    return prisma.playerSession.findFirst({
      where: {
        playerId,
        serverId: this.serverId,
        leftAt: null,
      },
      orderBy: { joinedAt: 'desc' },
      select: { id: true, joinedAt: true },
    })
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private async handlePlayerJoin(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerJoinData
    const joinedAt = this.eventTime(event)

    await prisma.$transaction(async (tx) => {
      // Upsert global Player record
      const player = await tx.player.upsert({
        where: { steamId: data.steamId },
        create: {
          steamId: data.steamId,
          displayName: data.displayName,
          lastSeen: joinedAt,
        },
        update: {
          displayName: data.displayName,
          lastSeen: joinedAt,
        },
        select: { id: true },
      })

      // Upsert per-server stats
      await tx.playerServerStats.upsert({
        where: {
          playerId_serverId: {
            playerId: player.id,
            serverId: this.serverId,
          },
        },
        create: {
          playerId: player.id,
          serverId: this.serverId,
          firstSeen: joinedAt,
          lastSeen: joinedAt,
        },
        update: {
          lastSeen: joinedAt,
        },
      })

      // Open a new session
      await tx.playerSession.create({
        data: {
          playerId: player.id,
          serverId: this.serverId,
          displayName: data.displayName,
          joinedAt,
        },
      })
    })
  }

  private async handlePlayerLeave(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerLeaveData
    const leftAt = this.eventTime(event)

    await prisma.$transaction(async (tx) => {
      // Resolve player inside transaction to avoid TOCTOU race
      const player = await tx.player.upsert({
        where: { steamId: data.steamId },
        create: { steamId: data.steamId, displayName: data.displayName ?? data.steamId },
        update: { displayName: data.displayName ?? undefined, lastSeen: leftAt },
      })

      // Find open session inside transaction
      const session = await tx.playerSession.findFirst({
        where: {
          playerId: player.id,
          serverId: this.serverId,
          leftAt: null,
        },
        orderBy: { joinedAt: 'desc' },
      })

      if (!session) {
        console.warn(
          `[rcon-event-persister] player.leave: no open session found for steamId=${data.steamId} on server ${this.serverId}`,
        )
        return
      }

      const durationSeconds = Math.floor(
        (leftAt.getTime() - session.joinedAt.getTime()) / 1000,
      )

      // Close the session
      await tx.playerSession.update({
        where: { id: session.id },
        data: {
          leftAt,
          reason: data.reason,
          duration: durationSeconds,
        },
      })

      // Accumulate total play time on per-server stats
      await tx.playerServerStats.update({
        where: {
          playerId_serverId: {
            playerId: player.id,
            serverId: this.serverId,
          },
        },
        data: {
          totalTime: { increment: durationSeconds },
          lastSeen: leftAt,
        },
      })
    })
  }

  private async handlePlayerDeath(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerDeathData

    const playerId = await this.resolvePlayer(data.steamId, data.displayName)

    await prisma.combatLog.create({
      data: {
        serverId: this.serverId,
        playerId,
        displayName: data.displayName,
        cause: data.cause,
        killerSteamId: data.killerSteamId ?? null,
        killerDisplayName: data.killerDisplayName ?? null,
        weapon: data.weapon ?? null,
        locationX: data.location?.x ?? null,
        locationY: data.location?.y ?? null,
        locationZ: data.location?.z ?? null,
        createdAt: this.eventTime(event),
      },
    })
  }

  private async handlePlayerChat(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerChatData

    const playerId = await this.resolvePlayer(data.steamId, data.displayName)

    await prisma.playerChat.create({
      data: {
        serverId: this.serverId,
        playerId,
        displayName: data.displayName,
        message: data.message,
        channel: data.channel,
        createdAt: this.eventTime(event),
      },
    })
  }

  private async handlePlayerBan(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerBanData

    await prisma.actionLog.create({
      data: {
        serverId: this.serverId,
        performedBy: data.bannedBy,
        userId: null,
        action: 'BAN',
        targetSteamId: data.steamId,
        source: 'rcon',
        createdAt: this.eventTime(event),
      },
    })
  }

  private async handlePlayerKick(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerKickData

    await prisma.actionLog.create({
      data: {
        serverId: this.serverId,
        performedBy: data.kickedBy,
        userId: null,
        action: 'KICK',
        targetSteamId: data.steamId,
        source: 'rcon',
        createdAt: this.eventTime(event),
      },
    })
  }

  private async handlePlayerPermissionChange(event: RconEvent): Promise<void> {
    const data = event.data as unknown as PlayerPermissionChangeData

    await prisma.actionLog.create({
      data: {
        serverId: this.serverId,
        performedBy: data.changedBy,
        userId: null,
        action: 'SETPERMISSION',
        targetSteamId: data.steamId,
        beforeValue: data.previous !== null ? JSON.stringify(data.previous) : null,
        afterValue: data.current !== null ? JSON.stringify(data.current) : null,
        source: 'rcon',
        createdAt: this.eventTime(event),
      },
    })
  }

  private async handleGameEvent(event: RconEvent): Promise<void> {
    const details =
      Object.keys(event.data).length > 0
        ? JSON.stringify(event.data)
        : null

    await prisma.gameEvent.create({
      data: {
        serverId: this.serverId,
        name: event.name,
        details,
        createdAt: this.eventTime(event),
      },
    })
  }

  private async handleWipeStart(event: RconEvent): Promise<void> {
    // wipe.start falls through to the GameEvent table — no WipeLog entry yet
    // (WipeLog is created by the dashboard when it dispatches the wipe command).
    await this.handleGameEvent(event)
  }

  private async handleWipeComplete(event: RconEvent): Promise<void> {
    const data = event.data as unknown as WipeCompleteData
    const completedAt = this.eventTime(event)

    // Attempt to enrich an existing WipeLog that matches type + server.
    // The most-recent unresolved entry (no durationMs) is the best candidate.
    const existingWipeLog = await prisma.wipeLog.findFirst({
      where: {
        serverId: this.serverId,
        type: data.type,
        durationMs: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    if (existingWipeLog) {
      await prisma.wipeLog.update({
        where: { id: existingWipeLog.id },
        data: {
          durationMs: data.durationMs,
          success: true,
        },
      })
    } else {
      // No matching WipeLog — record the completion as a GameEvent so it isn't lost.
      await this.handleGameEvent(event)
    }
  }

  private async handleArenaMatchStart(event: RconEvent): Promise<void> {
    const data = event.data as unknown as ArenaMatchStartData
    const startedAt = this.eventTime(event)

    // Resolve all participants to Player.id in parallel before the transaction.
    const resolvedParticipants = await Promise.all(
      data.participants.map(async (p) => ({
        playerId: await this.resolvePlayer(p.steamId),
        steamId: p.steamId,
        teamNumber: p.teamNumber,
      })),
    )

    await prisma.$transaction(async (tx) => {
      const match = await tx.arenaMatch.create({
        data: {
          serverId: this.serverId,
          gameMatchId: data.matchId,
          kit: data.kit,
          startedAt,
        },
        select: { id: true },
      })

      await tx.arenaMatchPlayer.createMany({
        data: resolvedParticipants.map((p) => ({
          matchId: match.id,
          playerId: p.playerId,
          // displayName is not in the start event participants array;
          // use steamId as a placeholder — real name was set on resolvePlayer.
          displayName: p.steamId,
          teamNumber: p.teamNumber,
        })),
      })
    })
  }

  private async handleArenaMatchEnd(event: RconEvent): Promise<void> {
    const data = event.data as unknown as ArenaMatchEndData

    // Look up the ArenaMatch by the composite unique key.
    const match = await prisma.arenaMatch.findUnique({
      where: {
        serverId_gameMatchId: {
          serverId: this.serverId,
          gameMatchId: data.matchId,
        },
      },
      select: { id: true },
    })

    if (!match) {
      console.warn(
        `[rcon-event-persister] arena.match.end: no ArenaMatch found for matchId=${data.matchId} on server ${this.serverId}`,
      )
      return
    }

    await prisma.arenaMatch.update({
      where: { id: match.id },
      data: {
        endedAt: this.eventTime(event),
        winnerTeam: data.winnerTeam,
        durationSeconds: data.durationSeconds,
        scores: JSON.stringify(data.scores),
      },
    })
  }

  private async handleArenaPlayerRespawn(event: RconEvent): Promise<void> {
    const data = event.data as unknown as ArenaPlayerRespawnData

    const match = await prisma.arenaMatch.findUnique({
      where: {
        serverId_gameMatchId: {
          serverId: this.serverId,
          gameMatchId: data.matchId,
        },
      },
      select: { id: true },
    })

    if (!match) {
      console.warn(
        `[rcon-event-persister] arena.player.respawn: no ArenaMatch found for matchId=${data.matchId} on server ${this.serverId}`,
      )
      return
    }

    const playerId = await this.resolvePlayer(data.steamId, data.displayName)

    // Increment the respawn counter atomically.
    await prisma.arenaMatchPlayer.updateMany({
      where: {
        matchId: match.id,
        playerId,
      },
      data: {
        respawns: { increment: 1 },
      },
    })
  }
}
