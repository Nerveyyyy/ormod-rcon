import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, type TestContext } from './helpers/setup.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestContext()
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Auth guards', () => {
  describe('protected routes require authentication', () => {
    it('GET /api/servers without auth → 401', async () => {
      const res = await ctx.unauthenticated.get('/api/servers')
      expect(res.statusCode).toBe(401)
    })

    it('POST /api/servers without auth → rejected (401 or 403)', async () => {
      // CSRF validation (onRequest) may fire before auth guard (preHandler),
      // returning 403 instead of 401. Either way, the request is rejected.
      const res = await ctx.unauthenticated.post('/api/servers', {
        payload: JSON.stringify({ name: 'Test', serverName: 'test', savePath: '/tmp/test' }),
        headers: { 'content-type': 'application/json' },
      })
      expect([401, 403]).toContain(res.statusCode)
    })

    it('GET /api/lists without auth → 401', async () => {
      const res = await ctx.unauthenticated.get('/api/lists')
      expect(res.statusCode).toBe(401)
    })
  })

  describe('authenticated requests pass auth guard', () => {
    it('GET /api/servers with auth → 200', async () => {
      const res = await ctx.viewer.get('/api/servers')
      expect(res.statusCode).toBe(200)
    })

    it('GET /api/lists with auth → 200', async () => {
      const res = await ctx.viewer.get('/api/lists')
      expect(res.statusCode).toBe(200)
    })
  })

  describe('public endpoints bypass auth guard', () => {
    it('GET /health → 200 without auth', async () => {
      const res = await ctx.unauthenticated.get('/health')
      expect(res.statusCode).toBe(200)
    })

    it('GET /api/capabilities → 200 without auth', async () => {
      const res = await ctx.unauthenticated.get('/api/capabilities')
      expect(res.statusCode).toBe(200)
    })

    it('GET /api/setup → 200 without auth', async () => {
      const res = await ctx.unauthenticated.get('/api/setup')
      expect(res.statusCode).toBe(200)
    })

    it('GET /api/csrf-token → 200 without auth', async () => {
      const res = await ctx.unauthenticated.get('/api/csrf-token')
      expect(res.statusCode).toBe(200)
    })
  })
})
