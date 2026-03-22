/**
 * Schema validation tests — verify that PUT routes with body schemas properly
 * reject invalid input (null, array) and accept valid / partial bodies.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js'

let ctx: TestContext

// Slugs/names created during setup
let serverName: string
let listSlug: string
let taskSlug: string

beforeAll(async () => {
  ctx = await setupTestContext()
  await mockDockerManager()

  // Create a server as OWNER
  const serverRes = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Schema Test Server',
      serverName: 'schema-test-server',
      savePath: '/tmp/schema-test',
    }),
  })
  expect(serverRes.statusCode).toBe(201)
  serverName = JSON.parse(serverRes.body).serverName

  // Create an access list as ADMIN
  const listRes = await ctx.admin.post('/api/lists', {
    payload: JSON.stringify({
      name: 'Schema Test List',
      type: 'BAN',
      scope: 'GLOBAL',
    }),
  })
  expect(listRes.statusCode).toBe(201)
  listSlug = JSON.parse(listRes.body).slug

  // Create a schedule as OWNER
  const schedRes = await ctx.owner.post(`/api/servers/${serverName}/schedules`, {
    payload: JSON.stringify({
      type: 'COMMAND',
      cronExpr: '0 * * * *',
      label: 'Schema Test Schedule',
      payload: 'say hello',
      enabled: true,
    }),
  })
  expect(schedRes.statusCode).toBe(201)
  taskSlug = JSON.parse(schedRes.body).slug
})

afterAll(async () => {
  await ctx.cleanup()
})

// ── PUT /api/servers/:serverName ─────────────────────────────────────────────

describe('PUT /api/servers/:serverName schema validation', () => {
  it('valid body → 200', async () => {
    const res = await ctx.admin.put(`/api/servers/${serverName}`, {
      payload: JSON.stringify({ name: 'Updated Name' }),
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).name).toBe('Updated Name')
  })

  it('null body → 400', async () => {
    const res = await ctx.admin.put(`/api/servers/${serverName}`, {
      payload: 'null',
    })
    expect(res.statusCode).toBe(400)
  })

  it('array body → 400', async () => {
    const res = await ctx.admin.put(`/api/servers/${serverName}`, {
      payload: JSON.stringify(['not', 'an', 'object']),
    })
    expect(res.statusCode).toBe(400)
  })

  it('partial body (one optional field) → 200', async () => {
    const res = await ctx.admin.put(`/api/servers/${serverName}`, {
      payload: JSON.stringify({ notes: 'just a note' }),
    })
    expect(res.statusCode).toBe(200)
  })
})

// ── PUT /api/lists/:slug ──────────────────────────────────────────────────────

describe('PUT /api/lists/:slug schema validation', () => {
  it('valid body → 200', async () => {
    const res = await ctx.admin.put(`/api/lists/${listSlug}`, {
      payload: JSON.stringify({ name: 'Updated List Name' }),
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).name).toBe('Updated List Name')
  })

  it('null body → 400', async () => {
    const res = await ctx.admin.put(`/api/lists/${listSlug}`, {
      payload: 'null',
    })
    expect(res.statusCode).toBe(400)
  })

  it('array body → 400', async () => {
    const res = await ctx.admin.put(`/api/lists/${listSlug}`, {
      payload: JSON.stringify([{ name: 'bad' }]),
    })
    expect(res.statusCode).toBe(400)
  })

  it('partial body (one optional field) → 200', async () => {
    const res = await ctx.admin.put(`/api/lists/${listSlug}`, {
      payload: JSON.stringify({ description: 'just a description' }),
    })
    expect(res.statusCode).toBe(200)
  })
})

// ── PUT /api/servers/:serverName/schedules/:slug ──────────────────────────────

describe('PUT /api/servers/:serverName/schedules/:slug schema validation', () => {
  it('valid body → 200', async () => {
    const res = await ctx.owner.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
      payload: JSON.stringify({ label: 'Updated Label' }),
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).label).toBe('Updated Label')
  })

  it('null body → 400', async () => {
    const res = await ctx.owner.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
      payload: 'null',
    })
    expect(res.statusCode).toBe(400)
  })

  it('array body → 400', async () => {
    const res = await ctx.owner.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
      payload: JSON.stringify([{ label: 'bad' }]),
    })
    expect(res.statusCode).toBe(400)
  })

  it('partial body (one optional field) → 200', async () => {
    const res = await ctx.owner.put(`/api/servers/${serverName}/schedules/${taskSlug}`, {
      payload: JSON.stringify({ enabled: false }),
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).enabled).toBe(false)
  })
})
