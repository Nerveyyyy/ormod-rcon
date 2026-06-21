import { randomBytes } from 'node:crypto'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedRedisContainer } from '@testcontainers/redis'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const RUN = process.env.RUN_DB_TESTS === '1'

describe.skipIf(!RUN)('auth integration', () => {
  let container: StartedPostgreSqlContainer
  let redis: StartedRedisContainer
  let app: FastifyInstance

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
    const { RedisContainer } = await import('@testcontainers/redis')
    const { runMigrations } = await import('@ormod/database')

    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    redis = await new RedisContainer('redis:8-alpine').start()
    const url = container.getConnectionUri()
    await runMigrations(url)

    process.env.DATABASE_URL = url
    process.env.REDIS_URL = redis.getConnectionUrl()
    process.env.BETTER_AUTH_SECRET = 'test-secret-at-least-32-characters-long'
    process.env.PUBLIC_URL = 'http://localhost:3000'
    process.env.ORMOD_SECRET_KEY = randomBytes(32).toString('base64')

    const { buildApp } = await import('../src/app.js')
    app = await buildApp()
    await app.ready()
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
    await redis?.stop()
  })

  it('signs up, signs in, and resolves the session', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Operator',
        email: 'operator@example.com',
        password: 'password1234',
      },
    })
    expect(signup.statusCode).toBe(200)

    const signin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: {
        email: 'operator@example.com',
        password: 'password1234',
      },
    })
    expect(signin.statusCode).toBe(200)

    const setCookie = signin.headers['set-cookie']
    const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
    expect(cookie).toBeTruthy()

    const session = await app.auth.api.getSession({
      headers: new Headers({ cookie: cookie ?? '' }),
    })
    expect(session?.user.email).toBe('operator@example.com')
  })
})
