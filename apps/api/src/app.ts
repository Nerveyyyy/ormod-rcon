import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import autoload from '@fastify/autoload'
import type { DbClient, SecretEncrypter } from '@ormod/database'
import type { EventBus } from '@ormod/eventing'
import type { AppConfig } from './lib/config.js'
import { type AppLogger, requestLogLevel } from './lib/logger.js'
import { createAuth, type Auth } from './lib/auth.js'
import type { SetupStatusTracker } from './lib/setup-status.js'
import type { RconSupervisor } from './rcon/supervisor.js'
import './types.js'

const rootDir = dirname(fileURLToPath(import.meta.url))

export interface AppDeps {
  config: AppConfig
  logger: AppLogger
  db: DbClient
  bus: EventBus
  encrypter: SecretEncrypter
  supervisor: RconSupervisor
  setupStatus: SetupStatusTracker
  version: string
}

export interface BuiltApp {
  app: FastifyInstance
  auth: Auth
}

/**
 * Build the Fastify instance without starting it. Keeping listen() out
 * of this function makes the whole surface testable via `app.inject()`.
 *
 * Services are attached before any plugin registration so autoloaded
 * plugins and routes can reach them off `app.xxx` without closure-
 * based DI. Each plugin then lives in its own file under `plugins/`
 * and is picked up by `@fastify/autoload`.
 */
export const createApp = async (deps: AppDeps): Promise<BuiltApp> => {
  const app = Fastify({
    // Pino's Logger is structurally close to FastifyBaseLogger but TS
    // sees `msgPrefix` as required on the Fastify side and optional on
    // Pino; the cast silences the mismatch without changing runtime
    // behaviour.
    loggerInstance: deps.logger as unknown as FastifyBaseLogger,
    disableRequestLogging: true,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id']
      if (typeof incoming === 'string' && incoming.length > 0) return incoming
      if (Array.isArray(incoming) && incoming[0]) return incoming[0]
      return randomUUID()
    },
  })

  // One log line per request, status-aware level. Replaces Fastify's
  // default request/response pair to keep things terse and consistent
  // with the project's logging conventions.
  app.addHook('onResponse', async (request, reply) => {
    const level = requestLogLevel(reply.statusCode, false)
    if (level === 'silent') return
    const ms = Number(reply.elapsedTime?.toFixed?.(1) ?? reply.elapsedTime ?? 0)
    request.log[level](
      { durationMs: ms },
      `[request:${ request.id }] ${ reply.statusCode } ${ request.method } ${ request.url }`,
    )
  })

  const auth = createAuth({
    db: deps.db,
    config: deps.config,
    setupStatus: deps.setupStatus,
  })

  app.decorate('config', deps.config)
  app.decorate('db', deps.db)
  app.decorate('bus', deps.bus)
  app.decorate('encrypter', deps.encrypter)
  app.decorate('auth', auth)
  app.decorate('supervisor', deps.supervisor)
  app.decorate('setupStatus', deps.setupStatus)
  app.decorate('appVersion', deps.version)

  await app.register(autoload, { dir: join(rootDir, 'plugins') })
  await app.register(autoload, { dir: join(rootDir, 'routes') })

  return { app, auth }
}
