import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, type TestContext } from './helpers/setup.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestContext()
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('GET /api/capabilities', () => {
  it('returns 200 with capabilities object', async () => {
    const res = await ctx.owner.get('/api/capabilities')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('dockerControl')
    expect(body).toHaveProperty('fileAccess')
    expect(body).toHaveProperty('rconAvailable')
    expect(body).toHaveProperty('authEnabled')
    expect(body).toHaveProperty('mode')
    expect(body.authEnabled).toBe(true)
  })

  it('is public (no auth required)', async () => {
    const res = await ctx.unauthenticated.get('/api/capabilities')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('mode')
  })

  it('dockerControl reflects env config', async () => {
    const res = await ctx.owner.get('/api/capabilities')
    const body = JSON.parse(res.body)
    // DOCKER_CONTROL_ENABLED defaults to 'true' in test env
    expect(body.dockerControl).toBe(true)
  })
})
