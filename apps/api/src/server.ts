import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './db/prisma-client.js';
import { dockerManager } from './services/docker-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { serversRoutes }     from './routes/servers.js';
import { playersRoutes }     from './routes/players.js';
import { settingsRoutes }    from './routes/settings.js';
import { accessListsRoutes } from './routes/access-lists.js';
import { consoleRoutes, consoleWsRoutes } from './routes/console.js';
import { wipeRoutes }        from './routes/wipe.js';
import { scheduleRoutes, registerCronJob } from './routes/schedule.js';

const PORT        = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
const STATIC_PATH    = process.env.STATIC_PATH; // set in Docker; absent in local dev

const app = Fastify({ logger: true });

await app.register(cors, { origin: CORS_ORIGIN, credentials: true });
await app.register(websocket);

// HTTP routes under /api prefix
await app.register(serversRoutes,     { prefix: '/api' });
await app.register(playersRoutes,     { prefix: '/api' });
await app.register(settingsRoutes,    { prefix: '/api' });
await app.register(accessListsRoutes, { prefix: '/api' });
await app.register(consoleRoutes,     { prefix: '/api' });
await app.register(wipeRoutes,        { prefix: '/api' });
await app.register(scheduleRoutes,    { prefix: '/api' });

// WebSocket log route at root — Vite proxy maps /ws/* -> ws://localhost:3001
await app.register(consoleWsRoutes);

app.get('/health', async () => ({ status: 'ok' }));

// ── Serve React frontend (Docker production only) ────────────────────────
// In local dev, Vite serves the frontend on its own port.
// In Docker, STATIC_PATH points to the compiled React build inside the image.
if (STATIC_PATH) {
  await app.register(fastifyStatic, {
    root: STATIC_PATH,
    prefix: '/',
  });
  // SPA fallback — serve index.html for all unmatched non-API routes
  app.setNotFoundHandler(async (req, reply) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
      return reply.sendFile('index.html', STATIC_PATH);
    }
    return reply.status(404).send({ error: 'Not found' });
  });
}

try {
  // Always bind to 0.0.0.0 inside the container — host-level IP restriction
  // is handled by Docker's ports: mapping (DASHBOARD_HOST in docker-compose.yml).
  await app.listen({ port: PORT, host: '0.0.0.0' });

  // Reconnect log streams for any game containers already running
  await dockerManager.reconnect();
  app.log.info('Docker manager reconnected to running containers');

  // Restore enabled cron jobs from DB
  const tasks = await prisma.scheduledTask.findMany({ where: { enabled: true } });
  for (const task of tasks) {
    registerCronJob(task);
  }
  app.log.info(`Restored ${tasks.length} scheduled task(s) from DB`);

} catch (err) {
  app.log.error(err);
  process.exit(1);
}
