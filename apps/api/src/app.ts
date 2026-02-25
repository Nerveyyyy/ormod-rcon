/**
 * app.ts — Builds and returns a configured Fastify instance.
 *
 * Separated from server.ts so the app can be imported in tests
 * without starting the HTTP listener.
 */

import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import autoload from '@fastify/autoload';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { consoleWsRoutes } from './routes/console.js';

// config.ts must be imported so the module augmentation is picked up
import './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function buildApp(opts?: FastifyServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, ...opts });

  // Autoload plugins/ — ordered by fastify-plugin dependency graph
  await app.register(autoload, {
    dir:            path.join(__dirname, 'plugins'),
    forceESM:       true,
    encapsulate:    false,
  });

  // WebSocket plugin must be registered before WS routes
  await app.register(websocket);

  // Health check (no /api prefix)
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  // Autoload routes/ under /api prefix
  // Ignore .d.ts files and the console WS routes (registered manually below)
  await app.register(autoload, {
    dir:            path.join(__dirname, 'routes'),
    dirNameRoutePrefix: false,
    options:        { prefix: '/api' },
    forceESM:       true,
    ignorePattern:  /\.d\./,
  });

  // WebSocket log route — Vite proxy maps /ws/* → ws://localhost:3001
  // Must be registered manually (no /api prefix)
  await app.register(consoleWsRoutes);

  // Serve React frontend (Docker production only)
  const staticPath = app.config.STATIC_PATH;
  if (staticPath) {
    await app.register(fastifyStatic, {
      root:   staticPath,
      prefix: '/',
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (!req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
        return reply.sendFile('index.html', staticPath);
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  return app;
}
