import type { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma-client.js';
import { FileIOService } from '../services/file-io.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/servers/:id/settings
  app.get<{ Params: { id: string } }>('/servers/:id/settings', async (req, reply) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    try {
      const io = new FileIOService(server.savePath);
      return await io.readSettings();
    } catch {
      return reply.status(404).send({ error: 'serversettings.json not found' });
    }
  });

  // PUT /api/servers/:id/settings
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/servers/:id/settings', async (req, reply) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    const io = new FileIOService(server.savePath);
    await io.writeSettings(req.body);
    return { ok: true };
  });

  // PUT /api/servers/:id/settings/:key
  app.put<{ Params: { id: string; key: string }; Body: { value: unknown } }>('/servers/:id/settings/:key', async (req, reply) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    const io = new FileIOService(server.savePath);
    const current = await io.readSettings();
    current[req.params.key] = req.body.value;
    await io.writeSettings(current);
    return { ok: true, key: req.params.key, value: req.body.value };
  });
};
