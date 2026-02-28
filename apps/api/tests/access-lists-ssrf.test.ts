/**
 * SSRF protection tests for POST /api/lists/:id/refresh
 *
 * The controller validates:
 *   1. The list must have scope === 'EXTERNAL' and a non-null externalUrl
 *   2. The URL must use http: or https: (no ftp://, etc.)
 *   3. The resolved IP must not be loopback, link-local, or RFC-1918 private
 *
 * DNS is mocked for the happy-path test so no real network call is made.
 * fetch is spied on to return a fixture payload of Steam IDs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import https from 'node:https'
import { setupTestContext, type TestContext } from './helpers/setup.js'

// ── Hoisted mocks: must be defined before any imports are resolved ────────────
// vi.hoisted runs synchronously during Vitest's hoisting phase, giving us
// references that can be used both in vi.mock factories AND in test cases.
const { mockDnsLookup } = vi.hoisted(() => ({
  mockDnsLookup: vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
}))

vi.mock('node:dns/promises', () => ({
  default: { lookup: mockDnsLookup },
}))

// node:https is NOT replaced via vi.mock — doing so with the tsx ESM loader
// doesn't reliably intercept calls made by the controller.  Instead we use
// vi.spyOn inside the happy-path test, which mutates the same CJS module
// singleton that the controller already holds a reference to.

let ctx: TestContext

// List IDs created in beforeAll
let externalListId: string
let banListId: string

beforeAll(async () => {
  ctx = await setupTestContext()

  // Create an EXTERNAL scope list (used for SSRF tests)
  const externalRes = await ctx.admin.post('/api/lists', {
    payload: JSON.stringify({
      name: 'External Feed',
      type: 'BAN',
      scope: 'EXTERNAL',
      externalUrl: 'https://example.com/bans.txt',
    }),
  })
  expect(externalRes.statusCode).toBe(201)
  externalListId = JSON.parse(externalRes.body).id

  // Create a plain BAN list (non-EXTERNAL, used for wrong-type test)
  const banRes = await ctx.admin.post('/api/lists', {
    payload: JSON.stringify({
      name: 'Regular Ban List',
      type: 'BAN',
      scope: 'GLOBAL',
    }),
  })
  expect(banRes.statusCode).toBe(201)
  banListId = JSON.parse(banRes.body).id
})

afterAll(async () => {
  await ctx.cleanup()
})

// ── Helper: create an EXTERNAL list with a specific URL ──────────────────────

async function createExternalList(url: string): Promise<string> {
  const res = await ctx.admin.post('/api/lists', {
    payload: JSON.stringify({
      name: `SSRF Test ${Date.now()}`,
      type: 'BAN',
      scope: 'EXTERNAL',
      externalUrl: url,
    }),
  })
  expect(res.statusCode).toBe(201)
  return JSON.parse(res.body).id
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/lists/:id/refresh (SSRF protection)', () => {
  it('non-EXTERNAL list (scope GLOBAL) → 400', async () => {
    const res = await ctx.admin.post(`/api/lists/${banListId}/refresh`)
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toMatch(/not an EXTERNAL/i)
  })

  it('ftp:// URL → 400 (invalid scheme)', async () => {
    const id = await createExternalList('ftp://example.com/list.txt')
    const res = await ctx.admin.post(`/api/lists/${id}/refresh`)
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toMatch(/http or https/i)
  })

  it('http://127.0.0.1 → 400 (loopback rejected)', async () => {
    mockDnsLookup.mockResolvedValueOnce({ address: '127.0.0.1', family: 4 })
    const id = await createExternalList('http://127.0.0.1/anything')
    const res = await ctx.admin.post(`/api/lists/${id}/refresh`)
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toMatch(/URL not allowed/i)
  })

  it('http://192.168.1.1 → 400 (private range rejected)', async () => {
    mockDnsLookup.mockResolvedValueOnce({ address: '192.168.1.1', family: 4 })
    const id = await createExternalList('http://192.168.1.1/')
    const res = await ctx.admin.post(`/api/lists/${id}/refresh`)
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toMatch(/URL not allowed/i)
  })

  it('happy path: public URL with valid Steam IDs → 200, imported >= 1', async () => {
    // dns mock already returns 93.184.216.34 (public) by default.
    // Spy on the real https module singleton — same object the controller holds.
    const { EventEmitter } = await import('node:events')
    const payload =
      '76561198000000001\n76561198000000002\nINVALID\n76561198000000003\nalso-invalid\n'

    const spy = vi.spyOn(https, 'request').mockImplementationOnce((_opts: unknown, cb: unknown) => {
      const mockRes = Object.assign(new EventEmitter(), {
        statusCode: 200,
        setEncoding: vi.fn(),
        resume: vi.fn(),
      })
      setImmediate(() => {
        ;(cb as (r: typeof mockRes) => void)(mockRes)
        mockRes.emit('data', payload)
        mockRes.emit('end')
      })
      return Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() }) as ReturnType<
        typeof https.request
      >
    })

    const res = await ctx.admin.post(`/api/lists/${externalListId}/refresh`)
    spy.mockRestore()

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
    expect(body.imported).toBe(3) // exactly 3 valid Steam IDs
  })

  it('VIEWER cannot refresh → 403', async () => {
    const res = await ctx.viewer.post(`/api/lists/${externalListId}/refresh`)
    expect(res.statusCode).toBe(403)
  })
})
