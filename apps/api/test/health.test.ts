import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { loadConfig } from '../src/config.js'
import { buildServer } from '../src/server.js'

const app = buildServer(loadConfig({ NODE_ENV: 'test' }))

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
