/**
 * server.ts — Thin entry point.
 *
 * Builds the Fastify app, starts the listener, and runs post-startup
 * tasks (Docker reconnect, cron job restoration).
 */

import fs from 'fs'
import cron from 'node-cron'
import type { FastifyServerOptions } from 'fastify'
import buildApp from './app.js'
import { dockerManager } from './services/docker-manager.js'
import { rconConnectionManager } from './services/rcon-connection-manager.js'
import { playerPoller } from './services/player-poller.js'
import prisma, { scheduleSqliteMaintenance } from './db/prisma-client.js'
import { registerCronJob } from './routes/schedule.js'

// ── Optional TLS ────────────────────────────────────────────────────────────
// Read cert paths from process.env BEFORE building the Fastify instance
// (@fastify/env isn't available yet).
const certPath = process.env.TLS_CERT_PATH || ''
const keyPath = process.env.TLS_KEY_PATH || ''
const tlsEnabled = certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)

const tlsOpts: FastifyServerOptions = tlsEnabled
  ? ({
      https: { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    } as FastifyServerOptions)
  : {}

const app = await buildApp(tlsOpts)

process.on('SIGTERM', async () => {
  playerPoller.stopAll()
  await app.close()
  process.exit(0)
})
process.on('SIGINT', async () => {
  playerPoller.stopAll()
  await app.close()
  process.exit(0)
})

// Prevent unhandled promise rejections from crashing the process.
// Docker socket errors and similar infrastructure failures should degrade
// gracefully, not kill the entire dashboard.
process.on('unhandledRejection', (err) => {
  app.log.error({ err }, 'Unhandled promise rejection (process kept alive)')
})

const port = Number(process.env.PORT ?? process.env.API_PORT) || app.config.PORT
const host = process.env.HOST ?? process.env.API_HOST ?? app.config.HOST

try {
  await app.listen({ port, host })
  app.log.info(`TLS: ${tlsEnabled ? 'enabled' : 'disabled (no certs configured)'}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

if (app.config.STATIC_PATH && !app.config.PUBLIC_URL) {
  app.log.warn(
    'PUBLIC_URL is not set but STATIC_PATH is (Docker mode). ' +
    'CORS and auth will only trust localhost — set PUBLIC_URL to your dashboard URL.'
  )
}

const isDemo = process.env.DEMO_MODE === 'true'

if (isDemo) {
  app.log.info('DEMO_MODE enabled — skipping Docker/RCON, seeding demo data')
  let server = await prisma.server.findUnique({ where: { serverName: 'demo-server' } })
  if (!server) {
    server = await prisma.server.create({
      data: { name: 'Demo Server', serverName: 'demo-server', gamePort: 27015, queryPort: 27016 },
    })
  }
  const { initDemoMode } = await import('./services/demo/index.js')
  await initDemoMode(server.id)
} else {
  dockerManager.setLogger(app.log)
  playerPoller.setLogger(app.log)

  // Start in degraded mode (no live log streams) if Docker is unavailable.
  try {
    await dockerManager.reconnect()
    app.log.info('Docker manager reconnected to running containers')

    // Start player polling for all running servers
    const servers = await prisma.server.findMany()
    for (const server of servers) {
      if (dockerManager.isRunning(server.id)) {
        playerPoller.startPolling(server.id)
      }
    }
  } catch (err) {
    app.log.warn({ err }, 'Docker manager reconnect failed — API starting in degraded mode (Docker unavailable)')
  }

  // Connect all RCON-enabled servers. Errors per-server are caught inside
  // reconnectAll() so a single bad server cannot block startup.
  try {
    await rconConnectionManager.reconnectAll()
    app.log.info('RCON connection manager reconnected to RCON-enabled servers')
  } catch (err) {
    app.log.warn({ err }, 'RCON connection manager reconnect failed — API starting without RCON connections')
  }
}

const tasks = await prisma.scheduledTask.findMany({ where: { enabled: true } })
let restoredCount = 0
for (const task of tasks) {
  try {
    registerCronJob(task)
    restoredCount++
  } catch (err) {
    app.log.error({ err, taskId: task.id }, `Failed to restore scheduled task ${task.id} — skipping`)
  }
}
app.log.info(`Restored ${restoredCount}/${tasks.length} scheduled task(s) from DB`)

scheduleSqliteMaintenance()

cron.schedule('0 2 * * *', async () => {
  try {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    await prisma.verification.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  } catch (err) {
    app.log.error({ err }, 'Cleanup cron failed')
  }
})
