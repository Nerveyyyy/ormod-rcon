import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverName: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Player Test Server',
      serverName: 'player-test-server',
    }),
  })
  serverName = JSON.parse(res.body).serverName
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Players routes', () => {
  describe('GET /api/servers/:serverName/players', () => {
    it('any authenticated user can list players', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverName}/players`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveProperty('data')
      expect(body).toHaveProperty('total')
      expect(body).toHaveProperty('page')
      expect(body).toHaveProperty('limit')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverName}/players`)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/players/:steamId', () => {
    it('returns player history (null when not found)', async () => {
      const res = await ctx.viewer.get('/api/players/76561198000000001')
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      // findUnique returns null for unknown steamId
      expect(body === null || (typeof body === 'object' && body.steamId)).toBe(true)
    })
  })
})
