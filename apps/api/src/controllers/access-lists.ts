import type { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma-client.js';
import { syncListToServer, syncAllLists } from '../services/list-service.js';

// ── List CRUD ────────────────────────────────────────────────────────────────

export async function listAccessLists() {
  const lists = await prisma.accessList.findMany({
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return lists.map(l => ({ ...l, entryCount: l._count.entries }));
}

export async function createAccessList(
  req: FastifyRequest<{ Body: { name: string; type: string; scope?: string; description?: string; externalUrl?: string } }>,
  reply: FastifyReply,
) {
  const list = await prisma.accessList.create({ data: req.body });
  reply.status(201);
  return list;
}

export async function getAccessList(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const list = await prisma.accessList.findUnique({
    where: { id: req.params.id },
    include: { entries: { orderBy: { createdAt: 'desc' } } },
  });
  if (!list) return reply.status(404).send({ error: 'List not found' });
  return list;
}

export async function updateAccessList(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply,
) {
  const list = await prisma.accessList.findUnique({ where: { id: req.params.id } });
  if (!list) return reply.status(404).send({ error: 'List not found' });
  return prisma.accessList.update({ where: { id: req.params.id }, data: req.body });
}

export async function deleteAccessList(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const list = await prisma.accessList.findUnique({ where: { id: req.params.id } });
  if (!list) return reply.status(404).send({ error: 'List not found' });
  await prisma.accessList.delete({ where: { id: req.params.id } });
  return { ok: true };
}

// ── Entries ──────────────────────────────────────────────────────────────────

export async function upsertEntry(
  req: FastifyRequest<{ Params: { id: string }; Body: { steamId: string; playerName?: string; reason?: string; addedBy?: string; permission?: string; expiresAt?: string } }>,
) {
  const { steamId, expiresAt, ...rest } = req.body;
  return prisma.listEntry.upsert({
    where: { steamId_listId: { steamId, listId: req.params.id } },
    create: { steamId, listId: req.params.id, expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
    update: { expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
  });
}

export async function deleteEntry(
  req: FastifyRequest<{ Params: { id: string; steamId: string } }>,
  reply: FastifyReply,
) {
  try {
    await prisma.listEntry.delete({
      where: { steamId_listId: { steamId: req.params.steamId, listId: req.params.id } },
    });
    return { ok: true };
  } catch {
    return reply.status(404).send({ error: 'Entry not found' });
  }
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export async function syncListToSingleServer(
  req: FastifyRequest<{ Params: { id: string; serverId: string } }>,
  reply: FastifyReply,
) {
  try {
    await syncListToServer(req.params.id, req.params.serverId);
    return { ok: true, syncedAt: new Date().toISOString() };
  } catch (err) {
    return reply.status(500).send({ error: String(err) });
  }
}

export async function syncAll(_req: FastifyRequest, reply: FastifyReply) {
  try {
    await syncAllLists();
    return { ok: true };
  } catch (err) {
    return reply.status(500).send({ error: String(err) });
  }
}

// ── External URL refresh ─────────────────────────────────────────────────────

export async function refreshExternal(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
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
}

// ── Server-list assignments ──────────────────────────────────────────────────

export async function getAssignments(
  req: FastifyRequest<{ Params: { id: string } }>,
) {
  return prisma.serverListLink.findMany({
    where: { serverId: req.params.id },
    include: { list: true },
  });
}

export async function setAssignments(
  req: FastifyRequest<{ Params: { id: string }; Body: { listIds: string[] } }>,
) {
  const { id: serverId } = req.params;
  const { listIds } = req.body;
  await prisma.$transaction([
    prisma.serverListLink.deleteMany({ where: { serverId } }),
    prisma.serverListLink.createMany({
      data: listIds.map(listId => ({ serverId, listId })),
    }),
  ]);
  return { ok: true };
}
