import fs from 'fs/promises'
import path from 'path'
import prisma from '../db/prisma-client.js'
import { FileIOService } from './file-io.js'
import { dockerManager } from './docker-manager.js'
import type { WipeType } from '../types.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type WipeConfig = {
  wipeType: WipeType
  customFiles?: string[]
  keepPlayerData: boolean
  keepAccessLists: boolean
  createBackup: boolean
  serverWillRestart: boolean
  notes?: string
}

// Files/directories targeted by each wipe preset.
// Paths are relative to server.savePath and must never escape it.
const WIPE_TARGETS: Record<WipeType, string[]> = {
  MAP_ONLY: [
    'ChunkData',
    'RegionData',
    'mapdata.json',
    'entitydata.json',
    'networkentities.json',
    'buildareas.json',
    'structuredata.dat',
    'partialchunkdata.dat',
    'pathfindingdata.dat',
    'spawnregion.dat',
    'loottables.json',
    'weatherdata.dat',
    'worldregrowth.json',
  ],
  MAP_PLAYERS: [
    'ChunkData',
    'RegionData',
    'mapdata.json',
    'entitydata.json',
    'networkentities.json',
    'buildareas.json',
    'structuredata.dat',
    'partialchunkdata.dat',
    'pathfindingdata.dat',
    'spawnregion.dat',
    'loottables.json',
    'weatherdata.dat',
    'worldregrowth.json',
    'PlayerData',
  ],
  FULL: [
    'ChunkData',
    'RegionData',
    'PlayerData',
    'mapdata.json',
    'entitydata.json',
    'networkentities.json',
    'buildareas.json',
    'structuredata.dat',
    'partialchunkdata.dat',
    'pathfindingdata.dat',
    'spawnregion.dat',
    'loottables.json',
    'weatherdata.dat',
    'worldregrowth.json',
    'log.txt',
  ],
  CUSTOM: [],
}

export class WipeService {
  async executeWipe(serverId: string, config: WipeConfig, userId: string) {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } })

    if (!server.savePath) {
      throw new Error('Server has no savePath configured — cannot wipe')
    }

    const savePath = path.resolve(server.savePath)
    const io = new FileIOService(savePath)
    let backupPath: string | undefined
    let errorMsg: string | undefined

    // ── 1. Stop the server (safe wipe requires no writes in flight) ──────────
    const wasRunning = dockerManager.isRunning(serverId)
    if (wasRunning) {
      await dockerManager.stop(serverId)
      // Give the process a moment to flush writes
      await sleep(3000)
    }

    try {
      // ── 2. Backup ──────────────────────────────────────────────────────────
      if (config.createBackup) {
        backupPath = await this.createBackup(savePath, server.serverName)
      }

      // ── 3. Validate + delete targets ──────────────────────────────────────
      const targets =
        config.wipeType === 'CUSTOM' ? (config.customFiles ?? []) : WIPE_TARGETS[config.wipeType]

      for (const target of targets) {
        this.assertSafePath(savePath, target)
        await io.deleteFileOrDir(target)
      }

      // ── 4. Restart if requested ───────────────────────────────────────────
      if (config.serverWillRestart) {
        await dockerManager.start(serverId)
      }
    } catch (err) {
      errorMsg = String(err)
      // Best-effort restart even on error — don't leave server down
      if (config.serverWillRestart && !dockerManager.isRunning(serverId)) {
        try {
          await dockerManager.start(serverId)
        } catch {
          /* log later */
        }
      }
    }

    // ── 5. Write wipe log ────────────────────────────────────────────────────
    const log = await prisma.wipeLog.create({
      data: {
        serverId: server.id,
        wipeType: config.wipeType,
        triggeredBy: userId,
        notes: config.notes,
        backupPath,
        success: !errorMsg,
        errorMsg,
      },
    })

    if (errorMsg) throw new Error(errorMsg)
    return log
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  private async createBackup(savePath: string, serverName: string): Promise<string> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = path.join(process.env.BACKUP_PATH ?? './backups', serverName, `wipe-backup-${ts}`)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.cp(savePath, dest, { recursive: true })
    return dest
  }

  // ── Path safety guard ──────────────────────────────────────────────────────

  /**
   * Ensures a deletion target is inside savePath.
   * Prevents path traversal attacks (e.g. a custom wipe target of "../../etc").
   */
  private assertSafePath(savePath: string, target: string): void {
    // Reject any target with path separators or traversal sequences
    if (target.includes('..') || target.includes('/') || target.includes('\\')) {
      throw new Error(`Unsafe wipe target rejected: "${target}"`)
    }
    const resolved = path.resolve(savePath, target)
    if (
      !resolved.startsWith(path.resolve(savePath) + path.sep) &&
      resolved !== path.resolve(savePath)
    ) {
      throw new Error(`Wipe target "${target}" escapes savePath — operation aborted`)
    }
  }
}
