/**
 * Race condition test for POST /api/setup.
 *
 * This test MUST live in its own file so that Vitest's `pool: 'forks'`
 * gives it an isolated Node.js process with a fresh prisma-client singleton.
 * If this test ran alongside other setup tests, the prisma singleton would
 * already be bound to a DB that has users, causing both concurrent requests
 * to see count > 0 and return 403.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_ROOT = path.resolve(__dirname, '..')
const TEST_DB_DIR = path.join(API_ROOT, '.test-dbs')

// Track cleanup paths for afterAll
const cleanupPaths: string[] = []

afterAll(async () => {
  for (const p of cleanupPaths) {
    try {
      fs.unlinkSync(p)
    } catch {}
    try {
      fs.unlinkSync(p + '-journal')
    } catch {}
    try {
      fs.unlinkSync(p + '-wal')
    } catch {}
    try {
      fs.unlinkSync(p + '-shm')
    } catch {}
  }
})

/**
 * Builds a fresh Fastify app against an empty isolated SQLite DB.
 * Since this file runs in its own forked process, the prisma-client module
 * singleton is uninitialized at the start of the file, so the first call
 * to setupEmptyApp() binds it to the test DB we create here.
 */
async function setupEmptyApp() {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true })
  }

  const dbName = `test-race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`
  const dbPath = path.join(TEST_DB_DIR, dbName)
  const dbUrl = `file:${dbPath}`

  cleanupPaths.push(dbPath)

  // Set env vars before any module that reads DATABASE_URL is imported
  process.env.DATABASE_URL = dbUrl
  process.env.WEB_HOST = 'localhost'
  process.env.WEB_PORT = '3000'
  process.env.NODE_ENV = 'test'
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-auth'
  process.env.DOCKER_CONTROL_ENABLED = 'true'
  process.env.DOCKER_SOCKET = '/var/run/docker.sock'
  process.env.GAME_CONTAINER_NAME = 'test-game'
  process.env.SAVES_PATH = ''
  process.env.SAVE_BASE_PATH = ''
  process.env.BACKUP_PATH = './test-backups'

  // Push schema to the new isolated DB
  execSync('npx prisma db push --accept-data-loss', {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  })

  // Dynamic import picks up DATABASE_URL from process.env.
  // Because this is the first import in this forked process, the singleton
  // will be initialized pointing at our empty test DB.
  const buildApp = (await import('../src/app.js')).default
  const app = await buildApp({ logger: false })
  await app.ready()

  const cleanup = async () => {
    await app.close()
  }

  return { app, cleanup }
}

describe('POST /api/setup (race condition)', () => {
  it('only one of two concurrent setup requests succeeds', async () => {
    const { app, cleanup } = await setupEmptyApp()
    try {
      // /api/setup now requires CSRF protection.  Fetch a token+cookie pair
      // before firing the concurrent requests.  The double-submit cookie scheme
      // allows the same token to be used by multiple in-flight requests.
      const csrfRes = await app.inject({ method: 'GET', url: '/api/csrf-token' })
      const rawCookies = csrfRes.headers['set-cookie']
      const csrfCookie = (Array.isArray(rawCookies) ? rawCookies : [rawCookies as string])
        .map((c: string) => c.split(';')[0])
        .join('; ')
      const csrfToken: string = JSON.parse(csrfRes.body).token

      const payload = JSON.stringify({
        name: 'Owner',
        email: 'owner@race.com',
        password: 'password12345',
      })
      const headers = {
        'content-type': 'application/json',
        cookie: csrfCookie,
        'x-csrf-token': csrfToken,
      }

      // Fire both requests concurrently — SQLite serialises writes, so the
      // compare-and-check logic in createOwner ensures exactly one succeeds.
      const [res1, res2] = await Promise.all([
        app.inject({ method: 'POST', url: '/api/setup', headers, payload }),
        app.inject({ method: 'POST', url: '/api/setup', headers, payload }),
      ])

      const statuses = [res1.statusCode, res2.statusCode].sort()
      // Exactly one request must succeed (200) and the other must be rejected (403)
      expect(statuses).toEqual([200, 403])
    } finally {
      await cleanup()
    }
  })
})
