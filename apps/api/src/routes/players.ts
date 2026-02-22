import type { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma-client.js';
import { FileIOService } from '../services/file-io.js';

export const playersRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/servers/:id/players
  app.get<{ Params: { id: string } }>('/servers/:id/players', async (req, reply) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const io = new FileIOService(server.savePath);

    let filePlayers: { steamId: string; data: unknown }[] = [];
    try { filePlayers = await io.listPlayers(); } catch { /* PlayerData dir may not exist yet */ }

    const adminLines = await io.readList('adminlist.txt');
    const permMap = new Map<string, string>();
    for (const line of adminLines) {
      const [steamId, perm] = line.split(':');
      if (steamId && perm) permMap.set(steamId.trim(), perm.trim());
    }

    return filePlayers.map(p => ({
      steamId: p.steamId,
      permission: permMap.get(p.steamId) ?? 'client',
      online: false,
      data: p.data,
    }));
  });

  // GET /api/players/:steamId
  app.get<{ Params: { steamId: string } }>('/players/:steamId', async (req) => {
    return prisma.playerRecord.findMany({
      where: { steamId: req.params.steamId },
      include: { server: { select: { id: true, name: true } } },
      orderBy: { lastSeen: 'desc' },
    });
  });
};
