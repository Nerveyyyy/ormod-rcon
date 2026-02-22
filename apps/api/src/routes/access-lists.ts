import type { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma-client.js';
import { syncListToServer, syncAllLists } from '../services/list-service.js';

export const accessListsRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/lists
  app.get('/lists', async () => {
    const lists = await prisma.accessList.findMany({
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return lists.map(l => ({ ...l, entryCount: l._count.entries }));
  });

  // POST /api/lists
  app.post<{ Body: { name: string; type: string; scope?: string; description?: string; externalUrl?: string } }>('/lists', async (req, reply) => {
    const list = await prisma.accessList.create({ data: req.body });
    reply.status(201);
    return list;
  });

  // GET /api/lists/:id
  app.get<{ Params: { id: string } }>('/lists/:id', async (req, reply) => {
    const list = await prisma.accessList.findUnique({
      where: { id: req.params.id },
      include: { entries: { orderBy: { createdAt: 'desc' } } },
    });
    if (!list) return reply.status(404).send({ error: 'List not found' });
    return list;
  });

  // PUT /api/lists/:id
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/lists/:id', async (req, reply) => {
    const list = await prisma.accessList.findUnique({ where: { id: req.params.id } });
    if (!list) return reply.status(404).send({ error: 'List not found' });
    return prisma.accessList.update({ where: { id: req.params.id }, data: req.body });
  });

  // DELETE /api/lists/:id
  app.delete<{ Params: { id: string } }>('/lists/:id', async (req, reply) => {
    const list = await prisma.accessList.findUnique({ where: { id: req.params.id } });
    if (!list) return reply.status(404).send({ error: 'List not found' });
    await prisma.accessList.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // POST /api/lists/:id/entries
  app.post<{ Params: { id: string }; Body: { steamId: string; playerName?: string; reason?: string; addedBy?: string; permission?: string; expiresAt?: string } }>('/lists/:id/entries', async (req, reply) => {
    const { steamId, expiresAt, ...rest } = req.body;
    const entry = await prisma.listEntry.upsert({
      where: { steamId_listId: { steamId, listId: req.params.id } },
      create: { steamId, listId: req.params.id, expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
      update: { expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
    });
    return entry;
  });

  // DELETE /api/lists/:id/entries/:steamId
  app.delete<{ Params: { id: string; steamId: string } }>('/lists/:id/entries/:steamId', async (req, reply) => {
    try {
      await prisma.listEntry.delete({
        where: { steamId_listId: { steamId: req.params.steamId, listId: req.params.id } },
      });
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: 'Entry not found' });
    }
  });

  // POST /api/lists/:id/sync/:serverId
  app.post<{ Params: { id: string; serverId: string } }>('/lists/:id/sync/:serverId', async (req, reply) => {
    try {
      await syncListToServer(req.params.id, req.params.serverId);
      return { ok: true, syncedAt: new Date().toISOString() };
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // POST /api/lists/sync-all
  app.post('/lists/sync-all', async (_, reply) => {
    try {
      await syncAllLists();
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // POST /api/lists/:id/refresh  (fetch external URL and import SteamIDs)
  app.post<{ Params: { id: string } }>('/lists/:id/refresh', async (req, reply) => {
    const list = await prisma.accessList.findUnique({ where: { id: req.params.id } });
    if (!list) return reply.status(404).send({ error: 'List not found' });
    if (list.scope !== 'EXTERNAL' || !list.externalUrl) {
      return reply.status(400).send({ error: 'List is not an EXTERNAL scope list with a URL' });
    }

    let text: string;
    try {
      const resp = await fetch(list.externalUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      text = await resp.text();
    } catch (err) {
      return reply.status(502).send({ error: `Failed to fetch external URL: ${err}` });
    }

    const steamIds = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^\d{17}$/.test(l));

    await prisma.$transaction([
      prisma.listEntry.deleteMany({ where: { listId: list.id } }),
      prisma.listEntry.createMany({
        data: steamIds.map(steamId => ({ steamId, listId: list.id, addedBy: 'external-feed' })),
      }),
      prisma.accessList.update({
        where: { id: list.id },
        data: { syncedAt: new Date() },
      }),
    ]);

    return { ok: true, imported: steamIds.length, syncedAt: new Date() };
  });

  // GET /api/servers/:id/list-assignments
  app.get<{ Params: { id: string } }>('/servers/:id/list-assignments', async (req) => {
    return prisma.serverListLink.findMany({
      where: { serverId: req.params.id },
      include: { list: true },
    });
  });

  // PUT /api/servers/:id/list-assignments
  app.put<{ Params: { id: string }; Body: { listIds: string[] } }>('/servers/:id/list-assignments', async (req) => {
    const { id: serverId } = req.params;
    const { listIds } = req.body;
    await prisma.$transaction([
      prisma.serverListLink.deleteMany({ where: { serverId } }),
      prisma.serverListLink.createMany({
        data: listIds.map(listId => ({ serverId, listId })),
      }),
    ]);
    return { ok: true };
  });
};
