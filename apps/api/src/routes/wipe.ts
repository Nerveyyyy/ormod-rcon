import type { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma-client.js';
import { WipeService } from '../services/wipe-service.js';
import type { WipeConfig } from '../services/wipe-service.js';

const wipeService = new WipeService();

export const wipeRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/servers/:id/wipes
  app.get<{ Params: { id: string } }>('/servers/:id/wipes', async (req) => {
    return prisma.wipeLog.findMany({
      where: { serverId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
  });

  // POST /api/servers/:id/wipe
  app.post<{ Params: { id: string }; Body: WipeConfig }>('/servers/:id/wipe', async (req, reply) => {
    reply.raw.setTimeout(300_000); // 5 min timeout for long wipes
    try {
      const log = await wipeService.executeWipe(req.params.id, req.body, 'dashboard');
      return log;
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // GET /api/servers/:id/wipes/:wipeId
  app.get<{ Params: { id: string; wipeId: string } }>('/servers/:id/wipes/:wipeId', async (req, reply) => {
    const log = await prisma.wipeLog.findUnique({ where: { id: req.params.wipeId } });
    if (!log) return reply.status(404).send({ error: 'Wipe log not found' });
    return log;
  });
};
