import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverId: string

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
  serverId = JSON.parse(res.body).id
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
  let taskId: string

  describe('POST /api/servers/:id/schedules (create)', () => {
    it('OWNER can create a schedule', async () => {
      const res = await ctx.owner.post(`/api/servers/${serverId}/schedules`, {
        payload: JSON.stringify(scheduleData),
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.label).toBe('Test Schedule')
      expect(body.type).toBe('COMMAND')
      taskId = body.id
    })

    it('ADMIN cannot create a schedule → 403', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/schedules`, {
        payload: JSON.stringify(scheduleData),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot create a schedule → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/schedules`, {
        payload: JSON.stringify(scheduleData),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /api/servers/:id/schedules', () => {
    it('any authenticated user can list schedules', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/schedules`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('PUT /api/servers/:id/schedules/:taskId (update)', () => {
    it('OWNER can update a schedule', async () => {
      const res = await ctx.owner.put(`/api/servers/${serverId}/schedules/${taskId}`, {
        payload: JSON.stringify({ label: 'Updated Schedule' }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.label).toBe('Updated Schedule')
    })

    it('ADMIN cannot update a schedule → 403', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverId}/schedules/${taskId}`, {
        payload: JSON.stringify({ label: 'Admin Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot update a schedule → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverId}/schedules/${taskId}`, {
        payload: JSON.stringify({ label: 'Viewer Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/servers/:id/schedules/:taskId', () => {
    it('ADMIN cannot delete a schedule → 403', async () => {
      const res = await ctx.admin.delete(`/api/servers/${serverId}/schedules/${taskId}`)
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot delete a schedule → 403', async () => {
      const res = await ctx.viewer.delete(`/api/servers/${serverId}/schedules/${taskId}`)
      expect(res.statusCode).toBe(403)
    })

    it('OWNER can delete a schedule', async () => {
      const res = await ctx.owner.delete(`/api/servers/${serverId}/schedules/${taskId}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
    })
  })
})
