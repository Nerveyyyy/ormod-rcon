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

const serverData = {
  name: 'Test Server',
  serverName: 'test-server-1',
}

describe('Servers routes', () => {
  let serverName: string

  describe('POST /api/servers (create)', () => {
    it('OWNER can create a server', async () => {
      const res = await ctx.owner.post('/api/servers', {
        payload: JSON.stringify(serverData),
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.name).toBe(serverData.name)
      expect(body.serverName).toBe(serverData.serverName)
      serverName = body.serverName
    })

    it('ADMIN cannot create a server → 403', async () => {
      const res = await ctx.admin.post('/api/servers', {
        payload: JSON.stringify({ name: 'Admin Server', serverName: 'admin-server' }),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot create a server → 403', async () => {
      const res = await ctx.viewer.post('/api/servers', {
        payload: JSON.stringify({ name: 'Viewer Server', serverName: 'viewer-server' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /api/servers', () => {
    it('any authenticated user can list servers', async () => {
      const res = await ctx.viewer.get('/api/servers')
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('GET /api/servers/:serverName', () => {
    it('returns server details', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverName}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.serverName).toBe(serverName)
      expect(body.name).toBe(serverData.name)
    })

    it('returns 404 for nonexistent server', async () => {
      const res = await ctx.viewer.get('/api/servers/nonexistent-server-name')
      expect(res.statusCode).toBe(404)
    })
  })

  describe('PUT /api/servers/:serverName (update)', () => {
    it('ADMIN can update a server', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverName}`, {
        payload: JSON.stringify({ name: 'Updated Server' }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('Updated Server')
    })

    it('OWNER can update a server', async () => {
      const res = await ctx.owner.put(`/api/servers/${serverName}`, {
        payload: JSON.stringify({ name: 'Owner Updated' }),
      })
      expect(res.statusCode).toBe(200)
    })

    it('VIEWER cannot update a server → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverName}`, {
        payload: JSON.stringify({ name: 'Viewer Updated' }),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /api/servers/:serverName/start|stop|restart (RBAC)', () => {
    // Docker socket is not available in tests. These tests verify the RBAC
    // layer only: ADMIN+ passes the auth guard (not 403), VIEWER is rejected.
    // The actual Docker call may fail with 500 — that's expected without Docker.

    it('ADMIN passes RBAC for start (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverName}/start`)
      expect(res.statusCode).not.toBe(403)
    })

    it('ADMIN passes RBAC for stop (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverName}/stop`)
      expect(res.statusCode).not.toBe(403)
    })

    it('ADMIN passes RBAC for restart (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverName}/restart`)
      expect(res.statusCode).not.toBe(403)
    })

    it('VIEWER cannot start a server → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverName}/start`)
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot stop a server → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverName}/stop`)
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot restart a server → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverName}/restart`)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/servers/:serverName', () => {
    it('ADMIN cannot delete a server → 403', async () => {
      const res = await ctx.admin.delete(`/api/servers/${serverName}`)
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot delete a server → 403', async () => {
      const res = await ctx.viewer.delete(`/api/servers/${serverName}`)
      expect(res.statusCode).toBe(403)
    })

    it('OWNER can delete a server', async () => {
      const res = await ctx.owner.delete(`/api/servers/${serverName}`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
    })
  })

  describe('DELETE /api/servers/:serverName (cascade)', () => {
    let cascadeServerName: string

    it('setup: create server and a schedule for it', async () => {
      // Create server
      const serverRes = await ctx.owner.post('/api/servers', {
        payload: JSON.stringify({
          name: 'Cascade Test',
          serverName: 'cascade-test',
        }),
      })
      expect(serverRes.statusCode).toBe(201)
      cascadeServerName = JSON.parse(serverRes.body).serverName

      // Create a scheduled task for this server
      const schedRes = await ctx.owner.post(`/api/servers/${cascadeServerName}/schedules`, {
        payload: JSON.stringify({
          type: 'COMMAND',
          cronExpr: '0 * * * *',
          label: 'Cascade Task',
          payload: 'say hello',
          enabled: true,
        }),
      })
      expect(schedRes.statusCode).toBe(201)
    })

    it('DELETE /api/servers/:serverName cascades — no FK error', async () => {
      const res = await ctx.owner.delete(`/api/servers/${cascadeServerName}`)
      expect(res.statusCode).toBe(200)
    })

    it('GET /api/servers/:serverName returns 404 after delete', async () => {
      const res = await ctx.viewer.get(`/api/servers/${cascadeServerName}`)
      expect(res.statusCode).toBe(404)
    })
  })
})
