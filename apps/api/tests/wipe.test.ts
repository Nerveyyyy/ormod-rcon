import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverName: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Wipe Test Server',
      serverName: 'wipe-test-server',
    }),
  })
  serverName = JSON.parse(res.body).serverName
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Wipe routes', () => {
  describe('GET /api/servers/:serverName/wipes', () => {
    it('any authenticated user can list wipes', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverName}/wipes`)
      expect(res.statusCode).toBe(200)
      expect(Array.isArray(JSON.parse(res.body))).toBe(true)
    })

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverName}/wipes`)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/servers/:serverName/wipe', () => {
    it('OWNER can execute a wipe', async () => {
      const res = await ctx.owner.post(`/api/servers/${serverName}/wipe`, {
        payload: JSON.stringify({}),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveProperty('id')
      expect(body.success).toBe(true)
    })

    it('ADMIN cannot execute a wipe → 403', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverName}/wipe`, {
        payload: JSON.stringify({}),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot execute a wipe → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverName}/wipe`, {
        payload: JSON.stringify({}),
      })
      expect(res.statusCode).toBe(403)
    })
  })
})
