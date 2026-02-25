import type { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma-client.js';
import { getAdapter } from '../services/rcon-adapter.js';
import { dockerManager } from '../services/docker-manager.js';

export async function sendCommand(
  req: FastifyRequest<{ Params: { id: string }; Body: { command: string } }>,
  reply: FastifyReply,
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return reply.status(404).send({ error: 'Server not found' });

  if (!dockerManager.isRunning(server.id)) {
    return reply.status(400).send({ error: 'Server is not running' });
  }

  try {
    const adapter = await getAdapter(server);
    await adapter.sendCommand(req.body.command);
    return { dispatched: true };
  } catch (err) {
    return reply.status(400).send({ error: String(err) });
  }
}

export async function getConsoleLog(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { lines?: string } }>,
  reply: FastifyReply,
) {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return reply.status(404).send({ error: 'Server not found' });

  const n = Math.min(parseInt(req.query.lines ?? '200'), 1000);
  const lines = dockerManager.getOutputBuffer(req.params.id).slice(-n);
  return { lines };
}
