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
  let listSlug: string

  describe('POST /api/lists (create)', () => {
    it('ADMIN can create an access list', async () => {
      const res = await ctx.admin.post('/api/lists', {
        payload: JSON.stringify({ name: 'Test Ban List', type: 'BAN', scope: 'GLOBAL' }),
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('Test Ban List')
      expect(body.type).toBe('BAN')
      listSlug = body.slug
    })

    it('OWNER can create an access list', async () => {
      const res = await ctx.owner.post('/api/lists', {
        payload: JSON.stringify({ name: 'Owner List', type: 'WHITELIST', scope: 'GLOBAL' }),
      })
      expect(res.statusCode).toBe(201)
    })

    it('VIEWER cannot create an access list → 403', async () => {
      const res = await ctx.viewer.post('/api/lists', {
        payload: JSON.stringify({ name: 'Viewer List', type: 'BAN', scope: 'GLOBAL' }),
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

  describe('GET /api/lists/:slug', () => {
    it('returns list details with entries', async () => {
      const res = await ctx.viewer.get(`/api/lists/${listSlug}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.slug).toBe(listSlug)
      expect(body).toHaveProperty('entries')
    })
  })

  describe('POST /api/lists/:slug/entries (add entry)', () => {
    it('ADMIN can add an entry', async () => {
      const res = await ctx.admin.post(`/api/lists/${listSlug}/entries`, {
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
      const res = await ctx.viewer.post(`/api/lists/${listSlug}/entries`, {
        payload: JSON.stringify({
          steamId: '76561198000000002',
          playerName: 'ViewerPlayer',
        }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/lists/:slug/entries/:steamId', () => {
    it('ADMIN can remove an entry', async () => {
      const res = await ctx.admin.delete(`/api/lists/${listSlug}/entries/76561198000000001`)
      expect(res.statusCode).toBe(200)
    })

    it('VIEWER cannot remove an entry → 403', async () => {
      const res = await ctx.viewer.delete(`/api/lists/${listSlug}/entries/76561198000000001`)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('PUT /api/lists/:slug (update)', () => {
    it('ADMIN can update a list', async () => {
      const res = await ctx.admin.put(`/api/lists/${listSlug}`, {
        payload: JSON.stringify({ name: 'Updated Ban List' }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('Updated Ban List')
    })

    it('VIEWER cannot update a list → 403', async () => {
      const res = await ctx.viewer.put(`/api/lists/${listSlug}`, {
        payload: JSON.stringify({ name: 'Viewer Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/lists/:slug', () => {
    it('VIEWER cannot delete a list → 403', async () => {
      const res = await ctx.viewer.delete(`/api/lists/${listSlug}`)
      expect(res.statusCode).toBe(403)
    })

    it('ADMIN can delete a list', async () => {
      const res = await ctx.admin.delete(`/api/lists/${listSlug}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
    })
  })
})
