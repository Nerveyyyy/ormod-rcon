import fs from 'fs/promises';
import path from 'path';
import prisma from '../db/prisma-client.js';
import { FileIOService } from './file-io.js';
import { dockerManager } from './docker-manager.js';
import type { WipeType } from '../types.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export type WipeConfig = {
  wipeType: WipeType;
  customFiles?: string[];
  keepPlayerData: boolean;
  keepAccessLists: boolean;
  createBackup: boolean;
  serverWillRestart: boolean;
  notes?: string;
};

const WIPE_TARGETS: Record<WipeType, string[]> = {
  MAP_ONLY: [
    'ChunkData', 'RegionData', 'mapdata.json', 'entitydata.json',
    'networkentities.json', 'buildareas.json', 'structuredata.dat',
    'partialchunkdata.dat', 'pathfindingdata.dat', 'spawnregion.dat',
    'loottables.json', 'weatherdata.dat', 'worldregrowth.json',
  ],
  MAP_PLAYERS: [
    'ChunkData', 'RegionData', 'mapdata.json', 'entitydata.json',
    'networkentities.json', 'buildareas.json', 'structuredata.dat',
    'partialchunkdata.dat', 'pathfindingdata.dat', 'spawnregion.dat',
    'loottables.json', 'weatherdata.dat', 'worldregrowth.json',
    'PlayerData',
  ],
  FULL: [
    'ChunkData', 'RegionData', 'PlayerData', 'mapdata.json',
    'entitydata.json', 'networkentities.json', 'buildareas.json',
    'structuredata.dat', 'partialchunkdata.dat', 'pathfindingdata.dat',
    'spawnregion.dat', 'loottables.json', 'weatherdata.dat',
    'worldregrowth.json', 'log.txt',
  ],
  CUSTOM: [],
};

export class WipeService {
  async executeWipe(serverId: string, config: WipeConfig, userId: string) {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    const io = new FileIOService(server.savePath);
    let backupPath: string | undefined;

    // 1. Stop server
    await dockerManager.stop(server.id);
    await sleep(3000);

    // 2. Backup (uses fs.cp — works on Windows and Linux)
    if (config.createBackup) {
      backupPath = await this.createBackup(server.savePath, server.serverName);
    }

    // 3. Delete files
    const targets = config.wipeType === 'CUSTOM'
      ? (config.customFiles ?? [])
      : WIPE_TARGETS[config.wipeType];

    for (const target of targets) {
      await io.deleteFileOrDir(target);
    }

    // 4. Write wipe log
    const log = await prisma.wipeLog.create({
      data: {
        serverId: server.id,
        wipeType: config.wipeType,
        triggeredBy: userId,
        notes: config.notes,
        backupPath,
        success: true,
      },
    });

    // 5. Restart if requested
    if (config.serverWillRestart) {
      await dockerManager.start(server.id);
    }

    return log;
  }

  private async createBackup(savePath: string, serverName: string): Promise<string> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(
      process.env.BACKUP_PATH ?? './backups',
      serverName,
      `wipe-backup-${ts}`
    );
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(savePath, dest, { recursive: true });
    return dest;
  }
}
