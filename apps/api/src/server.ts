/**
 * server.ts — Thin entry point.
 *
 * Builds the Fastify app, starts the listener, and runs post-startup
 * tasks (Docker reconnect, cron job restoration).
 */

import fs from 'fs'
import type { FastifyServerOptions } from 'fastify'
import buildApp from './app.js'
import { dockerManager } from './services/docker-manager.js'
import prisma from './db/prisma-client.js'
import { registerCronJob } from './routes/schedule.js'

// ── Optional TLS ────────────────────────────────────────────────────────────
// Read cert paths from process.env BEFORE building the Fastify instance
// (@fastify/env isn't available yet — chicken-and-egg).
const certPath = process.env.TLS_CERT_PATH || ''
const keyPath = process.env.TLS_KEY_PATH || ''
const tlsEnabled = certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)

const tlsOpts: FastifyServerOptions = tlsEnabled
  ? ({
      https: { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    } as FastifyServerOptions)
  : {}

const app = await buildApp(tlsOpts)

try {
  await app.listen({ port: app.config.API_PORT, host: app.config.API_HOST })
  app.log.info(`TLS: ${tlsEnabled ? 'enabled' : 'disabled (no certs configured)'}`)

  await dockerManager.reconnect()
  app.log.info('Docker manager reconnected to running containers')

  const tasks = await prisma.scheduledTask.findMany({ where: { enabled: true } })
  for (const task of tasks) {
    registerCronJob(task)
  }
  app.log.info(`Restored ${tasks.length} scheduled task(s) from DB`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
