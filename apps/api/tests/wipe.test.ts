import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext
let serverId: string
let saveDir: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  // Create a real temp directory so the wipe service can run without 500
  saveDir = path.join(os.tmpdir(), 'ormod-wipe-test-' + Date.now())
  fs.mkdirSync(saveDir, { recursive: true })

  // Create a server pointing at the temp directory
  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Wipe Test Server',
      serverName: 'wipe-test-server',
      savePath: saveDir,
    }),
  })
  serverId = JSON.parse(res.body).id
})

afterAll(async () => {
  await ctx.cleanup()
  // Clean up temp save directory
  try {
    fs.rmSync(saveDir, { recursive: true, force: true })
  } catch {}
})

describe('Wipe routes', () => {
  describe('GET /api/servers/:id/wipes', () => {
    it('any authenticated user can list wipes', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/wipes`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
    })

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverId}/wipes`)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/servers/:id/wipe', () => {
    it('OWNER can execute a wipe', async () => {
      const res = await ctx.owner.post(`/api/servers/${serverId}/wipe`, {
        payload: JSON.stringify({
          wipeType: 'MAP_ONLY',
          keepPlayerData: true,
          keepAccessLists: true,
          createBackup: false,
          serverWillRestart: false,
        }),
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveProperty('id')
    })

    it('ADMIN cannot execute a wipe → 403', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/wipe`, {
        payload: JSON.stringify({
          wipeType: 'MAP_ONLY',
          keepPlayerData: true,
          keepAccessLists: true,
          createBackup: false,
          serverWillRestart: false,
        }),
      })
      expect(res.statusCode).toBe(403)
    })

    it('VIEWER cannot execute a wipe → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/wipe`, {
        payload: JSON.stringify({
          wipeType: 'MAP_ONLY',
          keepPlayerData: true,
          keepAccessLists: true,
          createBackup: false,
          serverWillRestart: false,
        }),
      })
      expect(res.statusCode).toBe(403)
    })
  })
})
