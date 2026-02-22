import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import prisma from '../db/prisma-client.js';
import { getAdapter } from '../services/rcon-adapter.js';
import { dockerManager } from '../services/docker-manager.js';

// ── HTTP routes — registered under /api prefix ───────────────────────────────
export const consoleRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/servers/:id/console/command
  // Writes a command to the running process stdin via the RCON adapter.
  app.post<{ Params: { id: string }; Body: { command: string } }>(
    '/servers/:id/console/command',
    async (req, reply) => {
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
  );

  // GET /api/servers/:id/console/log?lines=200
  // Returns recent lines from the in-memory pty output buffer.
  // Falls back to an empty array gracefully (no file I/O needed).
  app.get<{ Params: { id: string }; Querystring: { lines?: string } }>(
    '/servers/:id/console/log',
    async (req, reply) => {
      const server = await prisma.server.findUnique({ where: { id: req.params.id } });
      if (!server) return reply.status(404).send({ error: 'Server not found' });

      const n     = Math.min(parseInt(req.query.lines ?? '200'), 1000);
      const lines = dockerManager.getOutputBuffer(req.params.id).slice(-n);
      return { lines };
    }
  );
};

// ── WebSocket route — registered WITHOUT /api prefix ────────────────────────
// Vite proxies /ws/* → ws://localhost:3001 (no /api prefix), so this must
// be registered at the app root, not under the /api plugin.
export const consoleWsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { serverId: string } }>(
    '/ws/log/:serverId',
    { websocket: true },
    (socket: WebSocket, req) => {
      const { serverId } = req.params;

      const send = (line: string) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ line }));
        }
      };

      // ── 1. Replay buffered output so the client sees history instantly ────
      const buffer = dockerManager.getOutputBuffer(serverId);
      for (const line of buffer) send(line);

      // ── 2. Subscribe to live pty output ───────────────────────────────────
      const emitter = dockerManager.getOutputEmitter(serverId);

      if (!emitter) {
        // Server not running and no recent output buffered
        send('# Server is not running. Start it from the Servers page.');
        return;
      }

      const lineHandler = (line: string) => send(line);
      const exitHandler = () => send('# Server process has stopped.');

      emitter.on('line', lineHandler);
      emitter.on('exit', exitHandler);

      socket.on('close', () => {
        emitter.off('line', lineHandler);
        emitter.off('exit', exitHandler);
      });
    }
  );
};
