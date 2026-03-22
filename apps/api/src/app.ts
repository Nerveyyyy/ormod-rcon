/**
 * app.ts — Builds and returns a configured Fastify instance.
 */

import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import autoload from '@fastify/autoload'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import addFormats from 'ajv-formats'
import path from 'path'
import { fileURLToPath } from 'url'
import { consoleWsRoutes } from './routes/console.js'
import { activityWsRoutes } from './routes/activity-ws.js'
import { rconConnectionManager } from './services/rcon-connection-manager.js'

// config.ts must be imported so the module augmentation is picked up
import './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default async function buildApp(opts?: FastifyServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    ajv: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugins: [addFormats as any],
    },
    ...opts,
  })

  // Global rate limit: 1000 requests per minute per IP.
  // Auth endpoints (/api/auth/*) are rate-limited by BetterAuth internally
  // (5 req/60s) since reply.hijack() bypasses Fastify's rate limiter.
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  })

  // Autoload plugins/ — ordered by fastify-plugin dependency graph
  await app.register(autoload, {
    dir: path.join(__dirname, 'plugins'),
    forceESM: true,
    encapsulate: false,
  })

  // WebSocket plugin must be registered before WS routes
  await app.register(websocket, { options: { maxPayload: 4096 } })

  // Health check (no /api prefix)
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

  // Autoload routes/ under /api prefix
  // Ignore .d.ts files and the console WS routes (registered manually below)
  await app.register(autoload, {
    dir: path.join(__dirname, 'routes'),
    dirNameRoutePrefix: false,
    options: { prefix: '/api' },
    forceESM: true,
    ignorePattern: /\.d\.|activity-ws/,
  })

  // WebSocket log route — Vite proxy maps /ws/* → ws://localhost:3001
  // Must be registered manually (no /api prefix)
  await app.register(consoleWsRoutes)
  await app.register(activityWsRoutes)

  // Serve React frontend (Docker production only)
  const staticPath = app.config.STATIC_PATH
  if (staticPath) {
    await app.register(fastifyStatic, {
      root: staticPath,
      prefix: '/',
    })
    app.setNotFoundHandler(async (req, reply) => {
      if (!req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
        // Block /setup after setup is complete — redirect to /login server-side
        if (req.url === '/setup') {
          const { default: prisma } = await import('./db/prisma-client.js')
          const count = await prisma.user.count()
          if (count > 0) {
            return reply.redirect('/login')
          }
        }
        return reply.sendFile('index.html', staticPath)
      }
      return reply.status(404).send({ error: 'Not found' })
    })
  }

  // Decorate with the RCON connection manager singleton
  app.decorate('rconManager', rconConnectionManager)

  // Disconnect all RCON connections on graceful shutdown
  app.addHook('onClose', async () => {
    await rconConnectionManager.disconnectAll()
  })

  return app as FastifyInstance
}
