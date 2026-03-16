import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverId: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Player Test Server',
      serverName: 'player-test-server',
    }),
  })
  serverId = JSON.parse(res.body).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Players routes', () => {
  describe('GET /api/servers/:id/players', () => {
    it('any authenticated user can list players', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/players`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveProperty('raw')
    })

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverId}/players`)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/players/:steamId', () => {
    it('returns player history (may be empty)', async () => {
      const res = await ctx.viewer.get('/api/players/76561198000000001')
      expect(res.statusCode).toBe(200)
      expect(Array.isArray(JSON.parse(res.body))).toBe(true)
    })
  })
})
