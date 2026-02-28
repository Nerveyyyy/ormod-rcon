import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, type TestContext } from './helpers/setup.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestContext()
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('CSRF protection', () => {
  it('GET /api/csrf-token returns a token', async () => {
    const res = await ctx.owner.get('/api/csrf-token')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.token).toBeTypeOf('string')
    expect(body.token.length).toBeGreaterThan(0)
  })

  it('POST without CSRF token is rejected with 403', async () => {
    // Make a POST request without the CSRF token header
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: {
        cookie: ctx.owner.cookies,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ name: 'Test', serverName: 'csrf-test', savePath: '/tmp' }),
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST with valid CSRF token passes validation', async () => {
    // The owner client automatically includes CSRF token
    const res = await ctx.owner.post('/api/lists', {
      payload: JSON.stringify({ name: 'CSRF Test List', type: 'BAN' }),
    })
    // Should not be 403 (CSRF rejected) — may be 201 (created) or other non-CSRF error
    expect(res.statusCode).not.toBe(403)
  })

  it('POST /api/setup without CSRF token → 403 Forbidden (CSRF)', async () => {
    // /api/setup is now protected by CSRF.  Without a token, the middleware
    // rejects the request before the controller runs.
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'New Owner',
        email: 'newowner@test.com',
        password: 'password123',
      }),
    })
    expect(res.statusCode).toBe(403)
    // The CSRF middleware emits "Forbidden", not the controller's "Setup already complete"
    const body = JSON.parse(res.body)
    expect(body.error).toMatch(/forbidden/i)
  })

  it('POST /api/setup with valid CSRF → controller error (setup already done)', async () => {
    // With a valid CSRF cookie + token, the controller runs and returns its own
    // 403 because an owner already exists in the test context.
    const csrfRes = await ctx.app.inject({ method: 'GET', url: '/api/csrf-token' })
    const rawCookies = csrfRes.headers['set-cookie']
    const cookieHeader = (Array.isArray(rawCookies) ? rawCookies : [rawCookies as string])
      .map((c: string) => c.split(';')[0])
      .join('; ')
    const token: string = JSON.parse(csrfRes.body).token

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-csrf-token': token },
      payload: JSON.stringify({
        name: 'New Owner',
        email: 'newowner@test.com',
        password: 'password123',
      }),
    })
    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.error).toContain('Setup already complete')
  })
})
