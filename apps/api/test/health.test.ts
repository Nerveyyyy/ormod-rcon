import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import health from '../src/routes/health.js'

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify()
  await app.register(health)
  return app
}

const app = await buildTestApp()

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('GET /health', () => {
  it('returns ok with uptime and version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(res.statusCode).toBe(200)

    const body = res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.version).toBe('string')
  })
})
