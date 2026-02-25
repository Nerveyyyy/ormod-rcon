import type { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma-client.js';
import { dockerManager } from '../services/docker-manager.js';

type ServerBody = {
  name: string;
  serverName: string;
  savePath: string;
  containerName?: string | null;
  executablePath?: string;
  gamePort?: number;
  queryPort?: number;
  notes?: string;
};

export async function listServers() {
  const servers = await prisma.server.findMany({ orderBy: { createdAt: 'asc' } });
  return servers.map(s => ({ ...s, running: dockerManager.isRunning(s.id) }));
}

export async function createServer(
  req: FastifyRequest<{ Body: ServerBody }>,
  reply: FastifyReply,
) {
  const server = await prisma.server.create({ data: req.body });
  reply.status(201);
  return { ...server, running: false };
}

export async function getServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const server = await prisma.server.findUnique({
    where: { id: req.params.id },
    include: { wipeLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!server) return reply.status(404).send({ error: 'Server not found' });
  return { ...server, running: dockerManager.isRunning(server.id) };
}

export async function updateServer(
  req: FastifyRequest<{ Params: { id: string }; Body: Partial<ServerBody> }>,
  reply: FastifyReply,
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return reply.status(404).send({ error: 'Server not found' });
  const updated = await prisma.server.update({ where: { id: req.params.id }, data: req.body });
  return { ...updated, running: dockerManager.isRunning(updated.id) };
}

export async function deleteServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return reply.status(404).send({ error: 'Server not found' });
  if (dockerManager.isRunning(req.params.id)) {
    await dockerManager.stop(req.params.id);
  }
  await prisma.server.delete({ where: { id: req.params.id } });
  return { ok: true };
}

export async function startServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    await dockerManager.start(req.params.id);
    return { status: 'started' };
  } catch (err) {
    return reply.status(500).send({ error: String(err) });
  }
}

export async function stopServer(
  req: FastifyRequest<{ Params: { id: string } }>,
) {
  await dockerManager.stop(req.params.id);
  return { status: 'stopped' };
}

export async function restartServer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    await dockerManager.restart(req.params.id);
    return { status: 'restarted' };
  } catch (err) {
    return reply.status(500).send({ error: String(err) });
  }
}
