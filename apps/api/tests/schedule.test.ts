import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverName: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()
  // Create a server for schedule tests
  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Schedule Test Server',
      serverName: 'schedule-test-server',
      savePath: '/tmp/schedule-test',
    }),
  })
  serverName = JSON.parse(res.body).serverName
})
afterAll(async () => {
  await ctx.cleanup()
})

const scheduleData = {
  type: 'COMMAND',
  cronExpr: '0 */6 * * *',
  label: 'Test Schedule',
  payload: 'save',
}

describe('Schedule routes', () => {
  let taskSlug: string

  describe('POST /api/servers/:serverName/schedules (create)', () => {
    it('OWNER can create a schedule', async () => {
      const res = await ctx.owner.post(`/api/servers/${serverName}/schedules`, {
        payload: JSON.stringify(scheduleData),
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.label).toBe('Test Schedule')
      expect(body.type).toBe('COMMAND')
      taskSlug = body.slug
    })

    it('ADMIN cannot create a schedule → 403', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverName}/schedules`, {
        payload: JSON.stringify(scheduleData),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot create a schedule → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverName}/schedules`, {
        payload: JSON.stringify(scheduleData),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /api/servers/:serverName/schedules', () => {
    it('any authenticated user can list schedules', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverName}/schedules`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('PUT /api/servers/:serverName/schedules/:slug (update)', () => {
    it('OWNER can update a schedule', async () => {
      const res = await ctx.owner.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
        payload: JSON.stringify({ label: 'Updated Schedule' }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.label).toBe('Updated Schedule')
    })

    it('ADMIN cannot update a schedule → 403', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
        payload: JSON.stringify({ label: 'Admin Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot update a schedule → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
        payload: JSON.stringify({ label: 'Viewer Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/servers/:serverName/schedules/:slug', () => {
    it('ADMIN cannot delete a schedule → 403', async () => {
      const res = await ctx.admin.delete(`/api/servers/${serverName}/schedules/${taskSlug}`)
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot delete a schedule → 403', async () => {
      const res = await ctx.viewer.delete(`/api/servers/${serverName}/schedules/${taskSlug}`)
      expect(res.statusCode).toBe(403)
    })

    it('OWNER can delete a schedule', async () => {
      const res = await ctx.owner.delete(`/api/servers/${serverName}/schedules/${taskSlug}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
    })
  })
})
