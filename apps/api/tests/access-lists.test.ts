import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Access Lists routes', () => {
  let listId: string

  describe('POST /api/lists (create)', () => {
    it('ADMIN can create an access list', async () => {
      const res = await ctx.admin.post('/api/lists', {
        payload: JSON.stringify({ name: 'Test Ban List', type: 'BAN', scope: 'GLOBAL' }),
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('Test Ban List')
      expect(body.type).toBe('BAN')
      listId = body.id
    })

    it('OWNER can create an access list', async () => {
      const res = await ctx.owner.post('/api/lists', {
        payload: JSON.stringify({ name: 'Owner List', type: 'WHITELIST' }),
      })
      expect(res.statusCode).toBe(201)
    })

    it('VIEWER cannot create an access list → 403', async () => {
      const res = await ctx.viewer.post('/api/lists', {
        payload: JSON.stringify({ name: 'Viewer List', type: 'BAN' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /api/lists', () => {
    it('any authenticated user can list access lists', async () => {
      const res = await ctx.viewer.get('/api/lists')
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('GET /api/lists/:id', () => {
    it('returns list details with entries', async () => {
      const res = await ctx.viewer.get(`/api/lists/${listId}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.id).toBe(listId)
      expect(body).toHaveProperty('entries')
    })
  })

  describe('POST /api/lists/:id/entries (add entry)', () => {
    it('ADMIN can add an entry', async () => {
      const res = await ctx.admin.post(`/api/lists/${listId}/entries`, {
        payload: JSON.stringify({
          steamId: '76561198000000001',
          playerName: 'TestPlayer',
          reason: 'Testing',
        }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.steamId).toBe('76561198000000001')
    })

    it('VIEWER cannot add an entry → 403', async () => {
      const res = await ctx.viewer.post(`/api/lists/${listId}/entries`, {
        payload: JSON.stringify({
          steamId: '76561198000000002',
          playerName: 'ViewerPlayer',
        }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/lists/:id/entries/:steamId', () => {
    it('ADMIN can remove an entry', async () => {
      const res = await ctx.admin.delete(`/api/lists/${listId}/entries/76561198000000001`)
      expect(res.statusCode).toBe(200)
    })

    it('VIEWER cannot remove an entry → 403', async () => {
      const res = await ctx.viewer.delete(`/api/lists/${listId}/entries/76561198000000001`)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('PUT /api/lists/:id (update)', () => {
    it('ADMIN can update a list', async () => {
      const res = await ctx.admin.put(`/api/lists/${listId}`, {
        payload: JSON.stringify({ name: 'Updated Ban List' }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('Updated Ban List')
    })

    it('VIEWER cannot update a list → 403', async () => {
      const res = await ctx.viewer.put(`/api/lists/${listId}`, {
        payload: JSON.stringify({ name: 'Viewer Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/lists/:id', () => {
    it('VIEWER cannot delete a list → 403', async () => {
      const res = await ctx.viewer.delete(`/api/lists/${listId}`)
      expect(res.statusCode).toBe(403)
    })

    it('ADMIN can delete a list', async () => {
      const res = await ctx.admin.delete(`/api/lists/${listId}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
    })
  })
})
