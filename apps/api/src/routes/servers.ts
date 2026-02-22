import type { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma-client.js';
import { dockerManager } from '../services/docker-manager.js';

type ServerBody = {
  name: string;
  serverName: string;
  savePath: string;
  executablePath?: string;   // Docker container name in Docker mode
  gamePort?: number;
  queryPort?: number;
  notes?: string;
};

export const serversRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/servers
  app.get('/servers', async () => {
    const servers = await prisma.server.findMany({ orderBy: { createdAt: 'asc' } });
    return servers.map(s => ({ ...s, running: dockerManager.isRunning(s.id) }));
  });

  // POST /api/servers
  app.post<{ Body: ServerBody }>('/servers', async (req, reply) => {
    const server = await prisma.server.create({ data: req.body });
    reply.status(201);
    return { ...server, running: false };
  });

  // GET /api/servers/:id
  app.get<{ Params: { id: string } }>('/servers/:id', async (req, reply) => {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: { wipeLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    return { ...server, running: dockerManager.isRunning(server.id) };
  });

  // PUT /api/servers/:id
  app.put<{ Params: { id: string }; Body: Partial<ServerBody> }>('/servers/:id', async (req, reply) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    const updated = await prisma.server.update({ where: { id: req.params.id }, data: req.body });
    return { ...updated, running: dockerManager.isRunning(updated.id) };
  });

  // DELETE /api/servers/:id
  app.delete<{ Params: { id: string } }>('/servers/:id', async (req, reply) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    // Stop the container gracefully if running before removing from DB
    if (dockerManager.isRunning(req.params.id)) {
      await dockerManager.stop(req.params.id);
    }
    await prisma.server.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // POST /api/servers/:id/start
  app.post<{ Params: { id: string } }>('/servers/:id/start', async (req, reply) => {
    try {
      await dockerManager.start(req.params.id);
      return { status: 'started' };
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // POST /api/servers/:id/stop
  app.post<{ Params: { id: string } }>('/servers/:id/stop', async (req) => {
    await dockerManager.stop(req.params.id);
    return { status: 'stopped' };
  });

  // POST /api/servers/:id/restart
  app.post<{ Params: { id: string } }>('/servers/:id/restart', async (req, reply) => {
    try {
      await dockerManager.restart(req.params.id);
      return { status: 'restarted' };
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });
};
