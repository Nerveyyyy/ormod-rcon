import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

let ctx: TestContext
let serverId: string
let savePath: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  // Create a temp directory with player data
  savePath = path.join(os.tmpdir(), `ormod-test-players-${Date.now()}`)
  const playerDir = path.join(savePath, 'PlayerData')
  await fs.mkdir(playerDir, { recursive: true })

  // Create some player data files
  await fs.writeFile(
    path.join(playerDir, '76561198000000001.json'),
    JSON.stringify({ name: 'Player1', health: 100 })
  )
  await fs.writeFile(
    path.join(playerDir, '76561198000000002.json'),
    JSON.stringify({ name: 'Player2', health: 80 })
  )

  // Create adminlist
  await fs.writeFile(path.join(savePath, 'adminlist.txt'), '76561198000000001:admin\n')

  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Player Test Server',
      serverName: 'player-test-server',
      savePath,
    }),
  })
  serverId = JSON.parse(res.body).id
})

afterAll(async () => {
  await ctx.cleanup()
  await fs.rm(savePath, { recursive: true, force: true }).catch(() => {})
})

describe('Players routes', () => {
  describe('GET /api/servers/:id/players', () => {
    it('any authenticated user can list players', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/players`)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBe(2)
    })

    it('returns player data with permissions', async () => {
      const res = await ctx.owner.get(`/api/servers/${serverId}/players`)
      const body = JSON.parse(res.body)
      const adminPlayer = body.find((p: { steamId: string }) => p.steamId === '76561198000000001')
      expect(adminPlayer).toBeDefined()
      expect(adminPlayer.permission).toBe('admin')

      const normalPlayer = body.find((p: { steamId: string }) => p.steamId === '76561198000000002')
      expect(normalPlayer).toBeDefined()
      expect(normalPlayer.permission).toBe('client')
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
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
    })
  })
})
