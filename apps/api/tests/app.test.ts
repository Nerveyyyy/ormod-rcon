import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { InMemoryEventBus } from '@ormod/eventing'
import { createSingleKeyEncrypter, type DbClient } from '@ormod/database'
import cookiePlugin from '../src/plugins/cookie.js'
import sensiblePlugin from '../src/plugins/sensible.js'
import requestContextPlugin from '../src/plugins/request-context.js'
import authPlugin from '../src/plugins/auth.js'
import errorHandlerPlugin from '../src/plugins/error-handler.js'
import healthRoutes from '../src/routes/health.js'
import serverRoutes from '../src/routes/servers.js'
import type { AppConfig } from '../src/lib/config.js'
import type { Auth } from '../src/lib/auth.js'
import type { RconSupervisor } from '../src/rcon/supervisor.js'
import '../src/types.js'

/**
 * Scaffolding-level smoke tests.
 *
 * The full createApp() wires Better Auth + the real Postgres pool,
 * which needs a live database. These tests instead mount the route
 * modules onto a bare Fastify instance with stubbed decorators and the
 * same plugins the real app uses for auth / context / error shaping —
 * which is enough to prove routing, schema validation, the global
 * guard, and the error envelope line up end-to-end.
 */

const silentLogger = { error: () => {} }
const bus = new InMemoryEventBus(silentLogger)
const encrypter = createSingleKeyEncrypter(Buffer.alloc(32, 1))
// /readyz pings `select 1`; the smoke test only hits /healthz, so the
// stub returns an empty result for any execute() that does sneak in.
const fakeDb = {
  execute: async () => { return [] },
} as unknown as DbClient

// Stub Better Auth: getSession always returns null so the guard sees
// an anonymous caller. `handler` is never reached because the test
// never hits /api/auth/*.
const fakeAuth: Auth = {
  handler: async () => { return new Response(null, { status: 404 }) },
  api: {
    getSession: async () => { return null },
  },
}

const stubSupervisor: RconSupervisor = {
  start: () => { return Promise.resolve() },
  stop: () => { return Promise.resolve() },
  add: () => { return Promise.resolve() },
  remove: () => { return Promise.resolve() },
  getStatus: () => { return null },
}

// The error-handler plugin reads `app.config.NODE_ENV`; nothing else in
// the plugins under test touches the config, so a one-field stub is
// enough.
const fakeConfig = { NODE_ENV: 'test' } as unknown as AppConfig

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify()
  app.decorate('appVersion', '0.0.1-test')
  app.decorate('config', fakeConfig)
  app.decorate('db', fakeDb)
  app.decorate('bus', bus)
  app.decorate('encrypter', encrypter)
  app.decorate('auth', fakeAuth)
  app.decorate('supervisor', stubSupervisor)
  await app.register(sensiblePlugin)
  await app.register(cookiePlugin)
  await app.register(requestContextPlugin)
  await app.register(authPlugin)
  await app.register(errorHandlerPlugin)
  await app.register(healthRoutes)
  await app.register(serverRoutes)
  return app
}

describe('api routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /healthz returns status: ok + version + uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' })
    expect(res.statusCode).toBe(200)
    const body: { status: string; version: string; uptime: number } = res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBe('0.0.1-test')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
  })

  it('GET /api/servers rejects anonymous callers with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/servers' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({
      error: { code: 'unauthorized' },
    })
  })
})
