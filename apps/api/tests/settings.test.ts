import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverName: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Settings Test Server',
      serverName: 'settings-test-server',
    }),
  })
  serverName = JSON.parse(res.body).serverName
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Settings routes', () => {
  describe('GET /api/servers/:serverName/settings', () => {
    it('any authenticated user can read settings', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverName}/settings`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveProperty('raw')
    })

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverName}/settings`)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('PUT /api/servers/:serverName/settings/:key', () => {
    it('ADMIN can update a setting key', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverName}/settings/MaxPlayers`, {
        payload: JSON.stringify({ value: 50 }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
      expect(body.key).toBe('MaxPlayers')
      expect(body.value).toBe(50)
    })

    it('VIEWER cannot update a setting → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverName}/settings/MaxPlayers`, {
        payload: JSON.stringify({ value: 99 }),
      })
      expect(res.statusCode).toBe(403)
    })
  })
})
