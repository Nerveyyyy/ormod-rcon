import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, type TestContext } from './helpers/setup.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestContext()
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await ctx.owner.get('/health')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.ts).toBeTypeOf('number')
  })

  it('is accessible without authentication', async () => {
    const res = await ctx.unauthenticated.get('/health')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
  })
})
